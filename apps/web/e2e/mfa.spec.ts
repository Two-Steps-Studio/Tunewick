import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser, signIn, signOut } from "./helpers";
import { totp } from "./totp";

const SECURITY = "/ustawienia/bezpieczenstwo";

/** Waits for a fresh 30-second window so a code is never reused (servers may reject reuse). */
async function freshCode(secret: string, lastCode?: string) {
  let code = totp(secret);
  while (code === lastCode) {
    await new Promise((r) => setTimeout(r, 1000));
    code = totp(secret);
  }
  return code;
}

async function enableTotp(page: Page) {
  await page.goto(SECURITY);
  await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest wyłączone.");
  await page.getByRole("button", { name: "Włącz aplikację uwierzytelniającą" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await expect(page.getByRole("img", { name: /Kod QR/ })).toBeVisible();
  return secret;
}

test.describe("two-factor sign-in (TOTP)", () => {
  test.setTimeout(120_000);

  test("enable, sign in with the second step, and turn it off", async ({ page }) => {
    const email = await createConfirmedUser(page, "mfa");
    const secret = await enableTotp(page);

    await page.getByLabel("Kod z aplikacji (6 cyfr)").fill("000000");
    await page.getByRole("button", { name: "Potwierdź i włącz" }).click();
    await expect(page.getByText("Nieprawidłowy lub wygasły kod.")).toBeVisible();

    const enrollCode = await freshCode(secret);
    await page.getByLabel("Kod z aplikacji (6 cyfr)").fill(enrollCode);
    await page.getByRole("button", { name: "Potwierdź i włącz" }).click();
    await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest włączone.");

    // A password alone is no longer enough: every page leads to the second step.
    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/weryfikacja$/);
    await page.goto("/ustawienia");
    await expect(page).toHaveURL(/\/weryfikacja\?next=%2Fustawienia$/);

    await page.getByLabel("Kod z aplikacji (6 cyfr)").fill("123456");
    await page.getByRole("button", { name: "Potwierdź" }).click();
    await expect(page.getByText("Nieprawidłowy lub wygasły kod.")).toBeVisible();

    await page.getByLabel("Kod z aplikacji (6 cyfr)").fill(await freshCode(secret, enrollCode));
    await page.getByRole("button", { name: "Potwierdź" }).click();
    await expect(page).toHaveURL(/\/ustawienia$/);

    await page.goto(SECURITY);
    await page.getByRole("button", { name: "Wyłącz logowanie dwuskładnikowe" }).click();
    await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest wyłączone.");

    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/$/);
  });
});
