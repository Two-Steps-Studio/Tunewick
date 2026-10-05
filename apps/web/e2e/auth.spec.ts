import { expect, type Page, test } from "@playwright/test";

// Requires local Supabase (pnpm db:start && pnpm db:env) — emails are read from Mailpit.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const PASSWORD = "scena-gzm-2026";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.tunewick.local`;
}

/** Waits for the newest email to `to` and returns the path of the link in it. */
async function emailLinkPath(to: string, subjectIncludes: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const message = messages.find((m) => m.Subject.includes(subjectIncludes));
    if (message) {
      const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        HTML: string;
      };
      const href = detail.HTML.match(/href="([^"]*\/api\/auth\/confirm[^"]*)"/)?.[1];
      if (!href) throw new Error("No confirmation link in email");
      const url = new URL(href.replaceAll("&amp;", "&"));
      return `${url.pathname}${url.search}`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email "${subjectIncludes}" for ${to}`);
}

async function signUp(page: Page, email: string) {
  await page.goto("/rejestracja");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Mam co najmniej 16 lat").check();
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page).toHaveURL(/\/sprawdz-poczte\?reason=signup$/);
}

/** Signs out through the header and waits until the redirect has finished. */
async function signOut(page: Page) {
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Wyloguj" }).click();
  await expect(header.getByRole("link", { name: "Zaloguj się" })).toBeVisible();
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).last().click();
}

test.describe("authentication", () => {
  test("sign-up validates on the server and keeps the email", async ({ page }) => {
    await page.goto("/rejestracja");
    await page.getByLabel("E-mail").fill("niepoprawny");
    await page.getByLabel("Hasło", { exact: true }).fill("krotkie");
    await page.getByRole("button", { name: "Załóż konto" }).click();
    await expect(page.getByText("Podaj poprawny adres e-mail.")).toBeVisible();
    await expect(page.getByText("Hasło musi mieć co najmniej 10 znaków.")).toBeVisible();
    await expect(page.getByText("musisz mieć co najmniej 16 lat")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveValue("niepoprawny");
  });

  test("sign up → confirm email → signed in → sign out → sign in", async ({ page }) => {
    const email = uniqueEmail("signup");
    await signUp(page, email);

    // Unconfirmed accounts cannot sign in yet.
    await signIn(page, email);
    await expect(page.locator("form [role=alert]")).toHaveText(/potwierdź adres e-mail/);

    await page.goto(await emailLinkPath(email, "Potwierdź konto"));
    await expect(page).toHaveURL(/\/$/);
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "Wyloguj" })).toBeVisible();

    await signOut(page);

    await signIn(page, email, "zle-haslo-123");
    await expect(page.locator("form [role=alert]")).toHaveText("Nieprawidłowy e-mail lub hasło.");

    await signIn(page, email);
    await expect(page).toHaveURL(/\/$/);
    await expect(header.getByRole("button", { name: "Wyloguj" })).toBeVisible();

    // Signed-in users are sent away from the auth pages.
    await page.goto("/logowanie");
    await expect(page).toHaveURL(/\/$/);
  });

  test("an existing email gets the same response as a new one", async ({ page }) => {
    const email = uniqueEmail("dup");
    await signUp(page, email);
    await page.context().clearCookies();
    await signUp(page, email);
  });

  test("password reset via email link", async ({ page }) => {
    const email = uniqueEmail("reset");
    await signUp(page, email);
    await page.goto(await emailLinkPath(email, "Potwierdź konto"));
    await signOut(page);

    // Unknown addresses get the same answer (no account enumeration).
    await page.goto("/reset-hasla");
    await page.getByLabel("E-mail").fill(uniqueEmail("nobody"));
    await page.getByRole("button", { name: "Wyślij link" }).click();
    await expect(page).toHaveURL(/\/sprawdz-poczte\?reason=reset$/);

    await page.goto("/reset-hasla");
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Wyślij link" }).click();
    await expect(page).toHaveURL(/\/sprawdz-poczte\?reason=reset$/);

    await page.goto(await emailLinkPath(email, "Ustaw nowe hasło"));
    await expect(page).toHaveURL(/\/nowe-haslo$/);

    await page.getByLabel("Nowe hasło").fill("nowe-haslo-scena-1");
    await page.getByLabel("Powtórz hasło").fill("inne-haslo-scena-1");
    await page.getByRole("button", { name: "Zapisz hasło" }).click();
    await expect(page.getByText("Hasła nie są takie same.")).toBeVisible();

    await page.getByLabel("Nowe hasło").fill("nowe-haslo-scena-1");
    await page.getByLabel("Powtórz hasło").fill("nowe-haslo-scena-1");
    await page.getByRole("button", { name: "Zapisz hasło" }).click();
    await expect(page).toHaveURL(/\/$/);

    await signOut(page);
    await signIn(page, email, PASSWORD);
    await expect(page.locator("form [role=alert]")).toHaveText("Nieprawidłowy e-mail lub hasło.");
    await signIn(page, email, "nowe-haslo-scena-1");
    await expect(page).toHaveURL(/\/$/);
  });

  test("an invalid email link explains the problem", async ({ page }) => {
    await page.goto("/api/auth/confirm?token_hash=nieprawidlowy&type=email");
    await expect(page).toHaveURL(/\/logowanie\?error=linkInvalid$/);
    await expect(page.locator("form [role=alert]")).toHaveText(
      "Link jest nieprawidłowy lub wygasł.",
    );
  });

  test("the new-password page without a recovery session offers a new link", async ({ page }) => {
    await page.goto("/nowe-haslo");
    await expect(page.getByText("wygasł lub został już użyty")).toBeVisible();
    await expect(page.getByRole("link", { name: "Poproś o nowy link" })).toBeVisible();
  });
});
