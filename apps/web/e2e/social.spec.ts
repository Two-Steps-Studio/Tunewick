import { expect, type Page, test } from "@playwright/test";
import { accessToken, createConfirmedUser, dataApi } from "./helpers";

function uniqueHandle(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function setProfile(page: Page, handle: string, name: string) {
  await page.goto("/ustawienia");
  await page.getByLabel("Nazwa profilu (adres)").fill(handle);
  await page.getByLabel("Nazwa wyświetlana").fill(name);
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status")).toHaveText("Zapisano.");
}

test("follow a person to see their activity; a block ends it both ways", async ({
  page,
  browser,
}) => {
  // Ala keeps the default visibility (followers) and has a public playlist.
  await createConfirmedUser(page, "social-ala");
  const ala = uniqueHandle("ala");
  await setProfile(page, ala, "Ala z Bytomia");
  const created = await dataApi(await accessToken(page), "playlists", {
    title: "Na drogę",
    visibility: "public",
  });
  expect(created.status).toBe(201);

  const other = await browser.newContext({ locale: "pl-PL" });
  const bobPage = await other.newPage();
  await createConfirmedUser(bobPage, "social-bob");
  const bob = uniqueHandle("bob");
  await setProfile(bobPage, bob, "Bob z Zabrza");

  // Before following: the activity is hidden, and the page says so.
  await bobPage.goto(`/profil/${ala}`);
  const activity = bobPage.getByRole("region", { name: "Aktywność" });
  await expect(activity).toContainText(
    "Aktywność tej osoby jest widoczna tylko dla wybranych osób.",
  );
  await expect(bobPage.getByText("0 obserwujących")).toBeVisible();

  await bobPage.getByRole("button", { name: "Obserwuj: Ala z Bytomia" }).click();
  await expect(
    bobPage.getByRole("button", { name: "Przestań obserwować: Ala z Bytomia" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(bobPage.getByText("1 osoba obserwuje")).toBeVisible();
  await expect(activity.getByRole("link", { name: "Na drogę" })).toBeVisible();

  // Ala blocks Bob from his profile; the follow ends.
  await page.goto(`/profil/${bob}`);
  await page.getByRole("button", { name: "Zablokuj" }).click();
  await page.getByRole("button", { name: "Tak, zablokuj" }).click();
  await expect(page.getByRole("button", { name: "Odblokuj: Bob z Zabrza" })).toBeVisible();

  await bobPage.reload();
  await expect(bobPage.getByText("0 obserwujących")).toBeVisible();
  await expect(activity).toContainText(
    "Aktywność tej osoby jest widoczna tylko dla wybranych osób.",
  );
  await bobPage.getByRole("button", { name: "Obserwuj: Ala z Bytomia" }).click();
  await expect(
    bobPage.getByRole("alert").filter({ hasText: "Nie udało się zapisać" }),
  ).toBeVisible();
  await expect(bobPage.getByRole("button", { name: "Obserwuj: Ala z Bytomia" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Ala sees the block in settings and lifts it.
  await page.goto("/ustawienia");
  const blocked = page.locator("section", {
    has: page.getByRole("heading", { name: "Zablokowane osoby" }),
  });
  await expect(blocked.getByRole("link", { name: "Bob z Zabrza" })).toBeVisible();
  await blocked.getByRole("button", { name: "Odblokuj: Bob z Zabrza" }).click();
  await expect(page.getByRole("heading", { name: "Zablokowane osoby" })).toHaveCount(0);

  await other.close();
});

test("visitors see public activity only when the person chose it", async ({ page, browser }) => {
  await createConfirmedUser(page, "social-public");
  const handle = uniqueHandle("jawna");
  await setProfile(page, handle, "Jawna Osoba");
  await page.getByLabel("Kto widzi Twoją aktywność").selectOption("public");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status")).toHaveText("Zapisano.");

  const anonymous = await browser.newContext({ locale: "pl-PL" });
  const visitor = await anonymous.newPage();
  await visitor.goto(`/profil/${handle}`);
  await expect(visitor.getByRole("heading", { name: "Publiczne playlisty" })).toBeVisible();
  await expect(visitor.getByText("Brak publicznych playlist.")).toBeVisible();
  await expect(visitor.getByRole("button", { name: /Obserwuj/ })).toHaveCount(0);
  await anonymous.close();
});
