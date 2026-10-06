import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

async function createArtist(page: Page) {
  const slug = unique("wyd");
  await page.goto("/artysci/nowy");
  await page.getByLabel("Nazwa artysty").fill("Projekt Hałda");
  await page.getByLabel("Adres profilu").fill(slug);
  await page.getByRole("button", { name: "Załóż profil" }).click();
  await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));
  return slug;
}

async function trackTitles(page: Page) {
  return page.locator(".track-item__title").allTextContents();
}

test.describe("release editor", () => {
  test.setTimeout(90_000);

  test("create a draft with tracks, order, credits and genres", async ({ page, browser }) => {
    await createConfirmedUser(page, "release-owner");
    const artistSlug = await createArtist(page);

    await page.getByRole("link", { name: "Nowe wydawnictwo" }).click();
    await page.getByLabel("Tytuł").fill("Pierwsza EPka");
    await expect(page.getByLabel("Adres wydawnictwa")).toHaveValue("pierwsza-epka");
    await page.getByLabel("Rodzaj").selectOption("ep");
    await page.getByRole("button", { name: "Utwórz szkic" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/artysci/${artistSlug}/wydawnictwa/pierwsza-epka/edytuj$`),
    );
    await expect(page.getByText("EP · Szkic")).toBeVisible();
    await expect(page.getByText("Określ udział AI przed wysłaniem do weryfikacji.")).toBeVisible();

    for (const title of ["Hałda", "Szyb", "Familok"]) {
      await page.getByLabel("Tytuł utworu").fill(title);
      await page.getByRole("button", { name: "Dodaj utwór" }).click();
      await expect(page.locator(".track-item__title").last()).toHaveText(title);
    }
    await expect(page.getByLabel("Tytuł utworu")).toHaveValue("");
    expect(await trackTitles(page)).toEqual(["Hałda", "Szyb", "Familok"]);

    await page.getByRole("button", { name: "W górę: Familok" }).click();
    await expect.poll(() => trackTitles(page)).toEqual(["Hałda", "Familok", "Szyb"]);
    await expect(page.getByRole("button", { name: "W górę: Hałda" })).toBeDisabled();

    // Credits for a track.
    await page.getByText("Szczegóły: Hałda").click();
    const halda = page.locator(".track-item").first();
    await halda.getByLabel("Imię i nazwisko lub pseudonim").fill("Ola Nowak");
    await halda.getByLabel("Rola").selectOption("performer");
    await halda.getByLabel("Szczegóły (np. instrument)").fill("bas");
    await halda.getByRole("button", { name: "Dodaj twórcę" }).click();
    await expect(page.getByText("Ola Nowak")).toBeVisible();
    await expect(page.getByText("Wykonawca · bas")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal scroll with track details open").toBe(0);

    // Release details: declare AI involvement, explicit, date.
    await page.getByLabel("Udział sztucznej inteligencji").first().selectOption("human");
    await page.getByLabel("Data wydania").fill("2026-11-20");
    await page.getByLabel("Kod UPC/EAN (opcjonalnie)").fill("123");
    await page.getByRole("button", { name: "Zapisz" }).first().click();
    await expect(page.getByText("Kod UPC/EAN ma 12 lub 13 cyfr.")).toBeVisible();
    await page.getByLabel("Kod UPC/EAN (opcjonalnie)").fill("");
    await page.getByRole("button", { name: "Zapisz" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Zapisano." }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Określ udział AI przed wysłaniem do weryfikacji.")).toHaveCount(0);

    // Genres: at most three.
    for (const genre of ["Rock", "Punk", "Hardcore", "Metal"]) {
      await page.getByRole("checkbox", { name: genre, exact: true }).check();
    }
    await page
      .locator("form", { has: page.locator(".genre-picker") })
      .getByRole("button")
      .click();
    await expect(page.getByText("Najwyżej 3 gatunki.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Metal", exact: true }).uncheck();
    await page
      .locator("form", { has: page.locator(".genre-picker") })
      .getByRole("button")
      .click();
    await expect(page.locator(".genre-picker__option:has(input:checked)")).toHaveCount(3);

    // The draft is listed for members but stays invisible publicly and to outsiders.
    await page.goto(`/artysci/${artistSlug}/zarzadzaj`);
    await expect(page.getByText("EP · Szkic")).toBeVisible();

    const otherContext = await browser.newContext({ locale: "pl-PL" });
    const outsider = await otherContext.newPage();
    // Anonymous visitors are sent to sign in…
    await outsider.goto(`/artysci/${artistSlug}/wydawnictwa/pierwsza-epka/edytuj`);
    await expect(outsider).toHaveURL(/\/logowanie\?next=/);
    // The public address of an unpublished release does not exist for them.
    const draftPage = await outsider.goto(`/artysci/${artistSlug}/wydawnictwa/pierwsza-epka`);
    expect(draftPage?.status()).toBe(404);
    // …and signed-in non-members get a 404 without any draft content.
    await createConfirmedUser(outsider, "release-outsider");
    const response = await outsider.goto(`/artysci/${artistSlug}/wydawnictwa/pierwsza-epka/edytuj`);
    expect(response?.status()).toBe(404);
    expect(await outsider.content()).not.toContain("Pierwsza EPka");
    await outsider.goto(`/artysci/${artistSlug}`);
    await expect(outsider.getByText("Brak opublikowanych wydawnictw.")).toBeVisible();
    await expect(outsider.getByText("Pierwsza EPka")).toHaveCount(0);
    await otherContext.close();
  });

  test("delete a track and a draft", async ({ page }) => {
    await createConfirmedUser(page, "release-delete");
    const artistSlug = await createArtist(page);
    await page.getByRole("link", { name: "Nowe wydawnictwo" }).click();
    await page.getByLabel("Tytuł").fill("Do usunięcia");
    await page.getByRole("button", { name: "Utwórz szkic" }).click();
    await expect(page).toHaveURL(/wydawnictwa\/do-usuniecia\/edytuj$/);

    for (const title of ["A", "B"]) {
      await page.getByLabel("Tytuł utworu").fill(title);
      await page.getByRole("button", { name: "Dodaj utwór" }).click();
      await expect(page.locator(".track-item__title").last()).toHaveText(title);
    }
    await page.getByText("Szczegóły: A").click();
    await page.getByRole("button", { name: "Usuń utwór: A" }).click();
    await expect.poll(() => trackTitles(page)).toEqual(["B"]);
    await expect(page.locator(".track-item__number")).toHaveText(["1"]);

    await page.getByRole("button", { name: "Usuń szkic" }).click();
    await expect(page).toHaveURL(new RegExp(`/artysci/${artistSlug}/zarzadzaj$`));
    await expect(page.getByText("Nie ma jeszcze wydawnictw.")).toBeVisible();
  });
});
