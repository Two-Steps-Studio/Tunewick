import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

function unique(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

async function setHandle(page: Page, handle: string) {
  await page.goto("/ustawienia");
  await page.getByLabel("Nazwa profilu (adres)").fill(handle);
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Zapisano.");
}

test.describe("artist onboarding", () => {
  test.setTimeout(90_000);

  test("create artist, invite a member, request verification", async ({ page, browser }) => {
    await createConfirmedUser(page, "artist-owner");
    const slug = unique("cma");

    await page.goto("/artysci/nowy");
    await page.getByLabel("Nazwa artysty").fill("Zespół Ćma");
    await expect(page.getByLabel("Adres profilu")).toHaveValue("zespol-cma");
    await page.getByLabel("Adres profilu").fill("admin");
    await page.getByRole("button", { name: "Załóż profil" }).click();
    await expect(page.getByText("Ten adres jest zarezerwowany.")).toBeVisible();

    await page.getByLabel("Adres profilu").fill(slug);
    await page.getByRole("button", { name: "Załóż profil" }).click();
    await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zarządzaj: Zespół Ćma");

    // The public page is honest about verification.
    await page.goto(`/artysci/${slug}`);
    await expect(page.getByText("Profil niezweryfikowany")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zarządzaj profilem" })).toBeVisible();

    // Second person with a profile name accepts an invitation.
    const memberContext = await browser.newContext({ locale: "pl-PL" });
    const member = await memberContext.newPage();
    await createConfirmedUser(member, "artist-member");
    const handle = unique("basistka");
    await setHandle(member, handle);

    await page.goto(`/artysci/${slug}/zarzadzaj`);
    await page.getByLabel("Nazwa profilu osoby (adres)").fill("nie-ma-takiej-osoby");
    await page.getByRole("button", { name: "Zaproś" }).click();
    await expect(page.getByText("Nie ma profilu o takiej nazwie.")).toBeVisible();
    await page.getByLabel("Nazwa profilu osoby (adres)").fill(handle);
    await page.getByRole("button", { name: "Zaproś" }).click();
    await expect(page.getByText("zaproszenie wysłane")).toBeVisible();

    await member.goto("/ustawienia");
    await expect(member.getByText("Zaproszenie jako: Członek")).toBeVisible();
    await member.getByRole("button", { name: "Przyjmij zaproszenie" }).click();
    await expect(member.getByRole("link", { name: "Zarządzaj" })).toBeVisible();
    await member.getByRole("link", { name: "Zarządzaj" }).click();
    await expect(member).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));
    // Plain members cannot edit details or request verification.
    await expect(member.getByLabel("Nazwa artysty")).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Wyślij prośbę o weryfikację" })).toHaveCount(
      0,
    );
    await memberContext.close();

    // Owner requests verification.
    await page.reload();
    await page
      .getByLabel("Linki potwierdzające (jeden na linię)")
      .fill("http://niebezpieczny.example");
    await page.getByRole("button", { name: "Wyślij prośbę o weryfikację" }).click();
    await expect(page.getByText("Każdy link musi zaczynać się od https://")).toBeVisible();
    await page
      .getByLabel("Linki potwierdzające (jeden na linię)")
      .fill("https://zespol-cma.example\nhttps://bandcamp.example/cma");
    await page.getByRole("button", { name: "Wyślij prośbę o weryfikację" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Weryfikacja w toku" })).toBeVisible();
  });

  test("outsiders cannot open the management page", async ({ page, browser }) => {
    await createConfirmedUser(page, "artist-owner2");
    const slug = unique("kolektyw");
    await page.goto("/artysci/nowy");
    await page.getByLabel("Nazwa artysty").fill("Kolektyw");
    await page.getByLabel("Adres profilu").fill(slug);
    await page.getByRole("button", { name: "Załóż profil" }).click();
    await expect(page).toHaveURL(new RegExp(`/artysci/${slug}/zarzadzaj$`));

    const outsiderContext = await browser.newContext({ locale: "pl-PL" });
    const outsider = await outsiderContext.newPage();
    await createConfirmedUser(outsider, "outsider");
    const response = await outsider.goto(`/artysci/${slug}/zarzadzaj`);
    expect(response?.status()).toBe(404);
    await outsider.goto(`/artysci/${slug}`);
    await expect(outsider.getByRole("link", { name: "Zarządzaj profilem" })).toHaveCount(0);
    await outsiderContext.close();
  });
});
