import { expect, test } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  dataApi,
  enableTotp,
  freshCode,
  SECURITY,
  signIn,
  signOut,
} from "./helpers";

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

    // The password alone does not open the data either — not even straight through the API.
    const aal1 = await dataApi(await accessToken(page), "profiles?select=handle");
    expect(aal1.status).toBe(403);
    expect(((await aal1.json()) as { hint?: string }).hint).toBe("mfa_required");
    await page.goto("/ustawienia");
    await expect(page).toHaveURL(/\/weryfikacja\?next=%2Fustawienia$/);

    await page.getByLabel("Kod z aplikacji (6 cyfr)").fill("123456");
    await page.getByRole("button", { name: "Potwierdź" }).click();
    await expect(page.getByText("Nieprawidłowy lub wygasły kod.")).toBeVisible();

    await page.getByLabel("Kod z aplikacji (6 cyfr)").fill(await freshCode(secret, enrollCode));
    await page.getByRole("button", { name: "Potwierdź" }).click();
    await expect(page).toHaveURL(/\/ustawienia$/);
    const aal2 = await dataApi(await accessToken(page), "profiles?select=handle");
    expect(aal2.status).toBe(200);

    await page.goto(SECURITY);
    await page.getByRole("button", { name: "Wyłącz logowanie dwuskładnikowe" }).click();
    await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest wyłączone.");

    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/$/);
  });
});
