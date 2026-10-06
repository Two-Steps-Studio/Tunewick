import { expect, test } from "@playwright/test";
import { createConfirmedUser, enableMfa, grantRole } from "./helpers";

test("an admin creates a campaign and codes, a listener redeems one, the admin revokes it", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = await createConfirmedUser(page, "promo-admin");
  grantRole(admin, "admin");
  await page.goto("/admin/promocje");
  // Admins need two-factor sign-in first.
  await expect(page).toHaveURL(/\/ustawienia\/bezpieczenstwo$/);
  await enableMfa(page);

  await page.goto("/moderacja");
  await page.getByRole("link", { name: "Promocje" }).click();
  await expect(page).toHaveURL(/\/admin\/promocje$/);

  const name = `Klub ${Date.now().toString(36)}`;
  await page.getByLabel("Nazwa kampanii").fill(name);
  await page.getByLabel("Partner (opcjonalnie)").fill("Klub Hipnoza");
  await page.getByRole("button", { name: "Utwórz kampanię" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // Single-use codes: shown once.
  const generate = page.locator("form", {
    has: page.getByRole("button", { name: "Wygeneruj kody" }),
  });
  await generate.getByLabel("Liczba kodów (1–5000)").fill("2");
  await generate.getByLabel("Ile dni lub miesięcy").fill("30");
  await generate.getByRole("button", { name: "Wygeneruj kody" }).click();
  await expect(page.getByText(/^Wygenerowano 2 kody\. Zapisz je teraz/)).toBeVisible();
  const codes = (await page.getByLabel("Wygenerowane kody").inputValue()).split("\n");
  expect(codes).toHaveLength(2);
  expect(codes[0]).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^tunewick-codes-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByRole("heading", { name: "Kody (2)" })).toBeVisible();
  // The page never contains a full code after a reload.
  await page.reload();
  expect(await page.content()).not.toContain(codes[0]!);

  // A shared code needs a use limit; then it is created.
  const shared = page.locator("form", {
    has: page.getByRole("button", { name: "Utwórz kod wspólny" }),
  });
  await shared.getByLabel("Kod", { exact: true }).fill(`hip-${Date.now().toString(36)}`);
  await shared.getByLabel("Limit użyć").fill("");
  await shared.getByRole("button", { name: "Utwórz kod wspólny" }).click();
  await expect(shared.getByRole("alert")).toHaveText(
    "Sprawdź pola — któreś ma niepoprawną wartość.",
  );
  await shared.getByLabel("Limit użyć").fill("100");
  await shared.getByRole("button", { name: "Utwórz kod wspólny" }).click();
  await expect(shared.getByRole("status")).toHaveText("Kod wspólny utworzony.");
  await expect(page.getByRole("heading", { name: "Kody (3)" })).toBeVisible();

  // A listener redeems a generated code.
  const listenerContext = await browser.newContext({ locale: "pl-PL" });
  const listener = await listenerContext.newPage();
  await createConfirmedUser(listener, "promo-listener");
  await listener.goto("/ustawienia");
  await listener.getByLabel("Masz kod promocyjny?").fill(codes[0]!);
  await listener.getByRole("button", { name: "Użyj kodu" }).click();
  await expect(listener.getByText(`Z kodu: ${name}`)).toBeVisible();

  // The admin sees the redemption and revokes it with a reason.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Użycia (1)" })).toBeVisible();
  await page.getByLabel("Powód (widoczny w dzienniku zmian)").fill("Kod opublikowany na forum");
  await page.getByRole("button", { name: "Cofnij Premium" }).click();
  await expect(page.getByText(/· cofnięte$/)).toBeVisible();

  await listener.reload();
  await expect(listener.getByText(/^Free — /)).toBeVisible();

  // Turning the campaign off stops its codes at once.
  await page.getByRole("button", { name: "Wyłącz", exact: true }).first().click();
  await expect(page.getByText("Kampania jest wyłączona — żaden jej kod nie działa.")).toBeVisible();
  await listener.getByLabel("Masz kod promocyjny?").fill(codes[1]!);
  await listener.getByRole("button", { name: "Użyj kodu" }).click();
  await expect(listener.locator(".redeem-form").getByRole("alert")).toHaveText(
    "Ta promocja jest wyłączona.",
  );
  await listenerContext.close();
});

test("non-admins never see the promotions panel", async ({ page }) => {
  await createConfirmedUser(page, "promo-nobody");
  await page.goto("/admin/promocje");
  await expect(page).toHaveURL(/\/$/);
});
