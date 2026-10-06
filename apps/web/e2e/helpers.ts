import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { totp } from "./totp";

// Requires local Supabase (pnpm db:start && pnpm db:env) — emails are read from Mailpit.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const PASSWORD = "scena-gzm-2026";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.tunewick.local`;
}

/** Waits for the newest email to `to` and returns the path of the link in it. */
export async function emailLinkPath(to: string, subjectIncludes: string): Promise<string> {
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

export async function signUp(
  page: Page,
  email: string,
  inviteCode = process.env.E2E_INVITE_CODE ?? "",
) {
  await page.goto("/rejestracja");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Kod zaproszenia").fill(inviteCode);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Mam co najmniej 16 lat").check();
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await expect(page).toHaveURL(/\/sprawdz-poczte\?reason=signup$/);
}

/** Signs out through the header and waits until the redirect has finished. */
export async function signOut(page: Page) {
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Wyloguj" }).click();
  await expect(header.getByRole("link", { name: "Zaloguj się" })).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).last().click();
}

/** Creates a confirmed account and leaves the page signed in. */
export async function createConfirmedUser(page: Page, prefix: string) {
  const email = uniqueEmail(prefix);
  await signUp(page, email);
  await page.goto(await emailLinkPath(email, "Potwierdź konto"));
  await expect(page.getByRole("banner").getByRole("button", { name: "Wyloguj" })).toBeVisible();
  return email;
}

export const SECURITY = "/ustawienia/bezpieczenstwo";

/** Waits for a fresh 30-second window so a code is never reused (servers may reject reuse). */
export async function freshCode(secret: string, lastCode?: string) {
  let code = totp(secret);
  while (code === lastCode) {
    await new Promise((r) => setTimeout(r, 1000));
    code = totp(secret);
  }
  return code;
}

export async function enableTotp(page: Page) {
  await page.goto(SECURITY);
  await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest wyłączone.");
  await page.getByRole("button", { name: "Włącz aplikację uwierzytelniającą" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await expect(page.getByRole("img", { name: /Kod QR/ })).toBeVisible();
  return secret;
}

/** Turns on TOTP for the signed-in user and leaves the session at aal2. Returns the secret. */
export async function enableMfa(page: Page) {
  const secret = await enableTotp(page);
  await page.getByLabel("Kod z aplikacji (6 cyfr)").fill(await freshCode(secret));
  await page.getByRole("button", { name: "Potwierdź i włącz" }).click();
  await expect(page.getByRole("status")).toHaveText("Logowanie dwuskładnikowe jest włączone.");
  return secret;
}

/** Grants a staff role in the local database (the same script admins use to bootstrap). */
export function grantRole(email: string, role: "moderator" | "admin") {
  execFileSync(
    "node",
    ["../../scripts/grant-role.mjs", "--local", "--email", email, "--role", role],
    {
      stdio: "pipe",
    },
  );
}
