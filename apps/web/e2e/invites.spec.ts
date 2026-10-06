import { expect, test } from "@playwright/test";
import { emailLinkPath, PASSWORD, uniqueEmail } from "./helpers";

async function fillSignUp(page: import("@playwright/test").Page, email: string, invite: string) {
  await page.goto("/rejestracja");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Kod zaproszenia").fill(invite);
  await page.getByLabel("Mam co najmniej 16 lat").check();
  await page.getByRole("button", { name: "Załóż konto" }).click();
}

test.describe("closed beta invite gate", () => {
  test("sign-up without an invite code is refused", async ({ page }) => {
    await fillSignUp(page, uniqueEmail("no-invite"), "");
    await expect(page.getByText("Wpisz kod zaproszenia.")).toBeVisible();
    await expect(page).toHaveURL(/\/rejestracja$/);
  });

  test("an unknown invite code is refused", async ({ page }) => {
    await fillSignUp(page, uniqueEmail("bad-invite"), "NIE-MA-TAKIEGO-KODU");
    await expect(page.getByText("Ten kod jest nieprawidłowy")).toBeVisible();
    await expect(page).toHaveURL(/\/rejestracja$/);
  });

  test("a single-use invite works exactly once", async ({ page, browser }, testInfo) => {
    // Only one project may consume the shared single-use code.
    test.skip(testInfo.project.name !== "desktop-chromium", "single-use code is shared");
    const code = process.env.E2E_SINGLE_USE_INVITE ?? "";

    const first = uniqueEmail("once-a");
    await fillSignUp(page, first, code);
    await expect(page).toHaveURL(/\/sprawdz-poczte\?reason=signup$/);
    await page.goto(await emailLinkPath(first, "Potwierdź konto"));
    await expect(page.getByRole("banner").getByRole("button", { name: "Wyloguj" })).toBeVisible();

    const other = await browser.newContext({ locale: "pl-PL" });
    const second = await other.newPage();
    await fillSignUp(second, uniqueEmail("once-b"), code);
    await expect(second.getByText("Ten kod jest nieprawidłowy")).toBeVisible();
    await other.close();
  });

  test("calling the public Auth API directly cannot skip the invite", async ({ request }) => {
    const url = process.env.E2E_SUPABASE_URL ?? "";
    const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "";
    const response = await request.post(`${url}/auth/v1/signup`, {
      headers: { apikey: key, "content-type": "application/json" },
      data: { email: uniqueEmail("api-bypass"), password: PASSWORD },
    });
    // The database trigger rejects the insert, so Auth reports a server error and no user exists.
    expect(response.ok()).toBe(false);

    // Control: the same call with a valid invite succeeds, so the refusal above is the gate.
    const withInvite = await request.post(`${url}/auth/v1/signup`, {
      headers: { apikey: key, "content-type": "application/json" },
      data: {
        email: uniqueEmail("api-invited"),
        password: PASSWORD,
        data: { invite_code: process.env.E2E_INVITE_CODE },
      },
    });
    expect(withInvite.ok()).toBe(true);
  });
});
