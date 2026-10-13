import { type CDPSession, expect, test } from "@playwright/test";
import { accessToken, createConfirmedUser, dataApi, SECURITY, signIn, signOut } from "./helpers";

// A virtual authenticator (Chromium DevTools protocol) stands in for a fingerprint or face check.
async function virtualAuthenticator(cdp: CDPSession) {
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test.describe("two-factor sign-in with a passkey", () => {
  test.setTimeout(120_000);
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "virtual authenticators are Chromium-only",
  );

  test("add a passkey, sign in with it, remove it", async ({ page }) => {
    await virtualAuthenticator(await page.context().newCDPSession(page));
    const email = await createConfirmedUser(page, "passkey");

    await page.goto(SECURITY);
    await expect(page.getByRole("heading", { name: "Klucz dostępu (zalecane)" })).toBeVisible();
    await page.getByRole("button", { name: "Dodaj klucz dostępu" }).click();
    await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest włączone.");
    await expect(
      page.getByRole("list", { name: "Twoje klucze dostępu" }).getByRole("listitem"),
    ).toHaveCount(1);

    // A password alone is no longer enough; the passkey finishes sign-in, no code to type.
    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/weryfikacja/);
    await expect(page.getByLabel("Kod z aplikacji (6 cyfr)")).toHaveCount(0);
    await page.goto("/ustawienia");
    await expect(page).toHaveURL(/\/weryfikacja\?next=%2Fustawienia$/);
    await page.getByRole("button", { name: "Potwierdź kluczem dostępu" }).click();
    await expect(page).toHaveURL(/\/ustawienia$/);
    const aal2 = await dataApi(await accessToken(page), "profiles?select=handle");
    expect(aal2.status).toBe(200);

    await page.goto(SECURITY);
    await page.getByRole("button", { name: "Usuń klucz" }).click();
    await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest wyłączone.");
    await signOut(page);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/$/);
  });
});
