import { expect, type Page, test } from "@playwright/test";
import { createConfirmedUser, enableMfa, expectNoSidewaysScroll, grantRole } from "./helpers";

async function setHandle(page: Page, handle: string) {
  await page.goto("/ustawienia");
  await page.getByLabel("Nazwa profilu (adres)").fill(handle);
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Zapisano.");
}

test("an admin manages staff roles and grants Premium; everything is in the audit log", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const adminEmail = await createConfirmedUser(page, "panel-admin");
  await setHandle(page, `adm-${run}`);
  grantRole(adminEmail, "admin");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/ustawienia\/bezpieczenstwo$/);
  await enableMfa(page);

  const otherContext = await browser.newContext({ locale: "pl-PL" });
  const other = await otherContext.newPage();
  await createConfirmedUser(other, "panel-other");
  await setHandle(other, `osoba-${run}`);

  // A browser error report (as reportClientError sends it) shows up in the panel, grouped.
  const boom = `Test error ${run}`;
  for (let i = 0; i < 2; i++) {
    const sent = await other.request.post("/api/errors", {
      data: { message: boom, detail: "Error\n    at test (e2e.js:1:1)", path: "/szukaj?q=private" },
    });
    expect(sent.status()).toBe(204);
  }

  await page.goto("/moderacja");
  // Staff have one link more in the top bar - it still fits a phone.
  await expectNoSidewaysScroll(page);
  await page.getByRole("link", { name: "Administracja" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Administracja");
  await expect(page.getByText("closed_beta")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Odtwarzanie (7 dni)" })).toBeVisible();
  // The database has every migration this build expects: no warning.
  await expect(page.getByText(/^Baza danych jest starsza niż aplikacja/)).toHaveCount(0);
  // File processing health: queues and the worker's latest errors.
  await expect(page.getByRole("heading", { name: "Przetwarzanie plików" })).toBeVisible();
  await expect(page.getByText(/^Utwory: \d+ czeka, \d+ w trakcie\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Słuchanie: / })).toBeVisible();
  const appErrors = page.locator("section", {
    has: page.getByRole("heading", { name: "Błędy aplikacji" }),
  });
  const reported = appErrors.locator("li", { hasText: boom });
  await expect(reported).toContainText("Przeglądarka · 2 razy");
  await expect(reported).toContainText("/szukaj");
  await expect(reported).not.toContainText("private");

  // Staff role by profile handle.
  const staff = page.locator("section.settings-form__group", {
    has: page.getByRole("heading", { name: "Personel" }),
  });
  await staff.getByLabel("Nazwa profilu osoby").fill("nie-ma-takiej-osoby");
  await staff.getByRole("button", { name: "Nadaj rolę" }).click();
  // The error is shown next to the field it is about.
  await expect(staff.getByText(/^Nie ma konta z taką nazwą profilu\./)).toBeVisible();
  await staff.getByLabel("Nazwa profilu osoby").fill(`osoba-${run}`);
  await staff.getByRole("button", { name: "Nadaj rolę" }).click();
  await expect(staff.getByText(`@osoba-${run} · moderator`)).toBeVisible();
  await expect(staff.getByText(`@adm-${run} · administrator`)).toBeVisible();

  // Premium for support, seen by the person at once.
  const premium = page.locator("section.settings-form__group", {
    has: page.getByRole("heading", { name: "Premium dla wsparcia" }),
  });
  await premium.getByLabel("Nazwa profilu osoby").fill(`osoba-${run}`);
  await premium.getByLabel("Na ile dni").fill("14");
  await premium.getByLabel("Notatka (powód)").fill(`rekompensata ${run}`);
  await premium.getByRole("button", { name: "Przyznaj Premium" }).click();
  await expect(premium.getByRole("status")).toHaveText("Premium przyznane.");
  await other.goto("/ustawienia");
  await expect(other.getByText(/^Premium do /)).toBeVisible();
  await expect(
    other.getByText(`Przyznane przez zespół Tunewick: rekompensata ${run}`),
  ).toBeVisible();

  // Revoke, then read it all in the audit log.
  await staff.getByRole("button", { name: `Odbierz rolę moderator: osoba-${run}` }).click();
  await expect(staff.getByText(`@osoba-${run} · moderator`)).toHaveCount(0);
  await page.getByRole("link", { name: "role", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\?dziennik=role\.$/);
  const log = page.locator(".audit-log");
  await expect(log.getByText(new RegExp(`role\\.revoke · @adm-${run}`))).toBeVisible();
  await expect(log.getByText(new RegExp(`role\\.grant · @adm-${run}`))).toBeVisible();
  await page.getByRole("link", { name: "entitlement", exact: true }).click();
  await expect(log.getByText(new RegExp(`rekompensata ${run}`))).toBeVisible();

  await otherContext.close();
});

test("only admins open the administration page", async ({ page }) => {
  const email = await createConfirmedUser(page, "panel-mod");
  grantRole(email, "moderator");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
});
