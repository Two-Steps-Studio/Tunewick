import { expect, test } from "@playwright/test";
import { createConfirmedUser, PASSWORD } from "./helpers";

function uniqueHandle(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe("account settings and public profile", () => {
  test("settings require signing in and return there afterwards", async ({ page }) => {
    await page.goto("/ustawienia");
    await expect(page).toHaveURL(/\/logowanie\?next=%2Fustawienia$/);

    const email = await createConfirmedUser(page, "settings-redirect");
    await page.getByRole("banner").getByRole("button", { name: "Wyloguj" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Zaloguj się" })).toBeVisible();

    await page.goto("/ustawienia");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Hasło").fill(PASSWORD);
    await page.getByRole("button", { name: "Zaloguj się" }).last().click();
    await expect(page).toHaveURL(/\/ustawienia$/);
  });

  test("edit profile, see it publicly, keep private settings private", async ({
    page,
    browser,
  }) => {
    await createConfirmedUser(page, "settings");
    await page.getByRole("banner").getByRole("link", { name: "Konto" }).click();
    await expect(page).toHaveURL(/\/ustawienia$/);

    await page.getByLabel("Nazwa profilu (adres)").fill("admin");
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByText("Ta nazwa jest zarezerwowana.")).toBeVisible();

    await page.getByLabel("Nazwa profilu (adres)").fill("Zła Nazwa");
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByText("Użyj 2–40 znaków")).toBeVisible();

    const handle = uniqueHandle("basista");
    await page.getByLabel("Nazwa profilu (adres)").fill(handle);
    await page.getByLabel("Nazwa wyświetlana").fill("Basista z Gliwic");
    await page.getByLabel("O mnie").fill("Gram na basie w dwóch zespołach.");
    await page.getByLabel("Kto widzi Twoją aktywność słuchania").selectOption("private");
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByRole("status")).toHaveText("Zapisano.");

    await page.reload();
    await expect(page.getByLabel("Nazwa profilu (adres)")).toHaveValue(handle);
    await expect(page.getByLabel("Kto widzi Twoją aktywność słuchania")).toHaveValue("private");

    // An anonymous visitor sees only public fields.
    const anonymous = await browser.newContext({ locale: "pl-PL" });
    const visitor = await anonymous.newPage();
    await visitor.goto(`/profil/${handle}`);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Basista z Gliwic");
    await expect(visitor.getByText(`@${handle}`)).toBeVisible();
    await expect(visitor.getByText("Gram na basie w dwóch zespołach.")).toBeVisible();
    await expect(visitor.getByText("Na Tunewick od")).toBeVisible();
    await expect(visitor.locator("main")).not.toContainText("Tylko ja");
    await anonymous.close();
  });

  test("a handle cannot be taken twice", async ({ page, browser }) => {
    const handle = uniqueHandle("zajety");
    await createConfirmedUser(page, "owner");
    await page.goto("/ustawienia");
    await page.getByLabel("Nazwa profilu (adres)").fill(handle);
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByRole("status")).toHaveText("Zapisano.");

    const other = await browser.newContext({ locale: "pl-PL" });
    const second = await other.newPage();
    await createConfirmedUser(second, "second");
    await second.goto("/ustawienia");
    await second.getByLabel("Nazwa profilu (adres)").fill(handle);
    await second.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(second.getByText("Ta nazwa jest już zajęta.")).toBeVisible();
    await other.close();
  });

  test("changing the language switches the interface", async ({ page }) => {
    await createConfirmedUser(page, "locale");
    await page.goto("/ustawienia");
    await page.getByLabel("Język serwisu").selectOption("en");
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page).toHaveURL(/\/en\/settings$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Account");
    await expect(page.getByLabel("Language")).toHaveValue("en");
  });

  test("unknown profiles return 404", async ({ page }) => {
    const response = await page.goto("/profil/nikt-taki-nie-istnieje");
    expect(response?.status()).toBe(404);
  });
});
