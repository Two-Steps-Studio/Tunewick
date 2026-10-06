import { expect, test } from "@playwright/test";
import { accessToken, createConfirmedUser, createPromoCodes, dataApi } from "./helpers";

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("a listener redeems a promo code in settings and gets Premium", async ({ page }) => {
  const campaign = `E2E Festiwal ${run()}`;
  const [code] = createPromoCodes(campaign, ["--days", "30"]);
  await createConfirmedUser(page, "promo");
  await page.goto("/ustawienia");
  await expect(page.getByText(/^Free — /)).toBeVisible();
  const form = page.locator(".redeem-form");

  const input = page.getByLabel("Masz kod promocyjny?");
  await input.fill("ABCD-EFGH-JKMN-PQRS");
  await page.getByRole("button", { name: "Użyj kodu" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Ten kod nie działa. Sprawdź, czy jest wpisany dokładnie.",
  );
  // What was typed stays in the field after a failed attempt.
  await expect(input).toHaveValue("ABCD-EFGH-JKMN-PQRS");

  await input.fill(code!.toLowerCase());
  await page.getByRole("button", { name: "Użyj kodu" }).click();
  await expect(form.getByRole("status")).toHaveText("Kod przyjęty. Premium działa od teraz.");
  await expect(page.getByText(/^Premium do \d{1,2} \S+ \d{4}/)).toBeVisible();
  await expect(page.getByText(`Z kodu: ${campaign}`)).toBeVisible();

  await page.getByLabel("Masz kod promocyjny?").fill(code!);
  await page.getByRole("button", { name: "Użyj kodu" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Ten kod (albo kod z tej samej promocji) jest już użyty na Twoim koncie.",
  );
});

test("a single-use code redeemed by six accounts at once is granted exactly once", async ({
  browser,
}, testInfo) => {
  // A database-level check: one browser project is enough (six sign-ups per project is load).
  test.skip(testInfo.project.name !== "desktop-chromium");
  test.setTimeout(120_000);
  const [code] = createPromoCodes(`E2E Concurrency ${run()}`, ["--days", "7"]);
  const tokens = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const context = await browser.newContext({ locale: "pl-PL" });
      const page = await context.newPage();
      await createConfirmedUser(page, `promo-race-${i}`);
      const token = await accessToken(page);
      await context.close();
      return token;
    }),
  );
  const results = await Promise.all(
    tokens.map(async (token) => {
      const response = await dataApi(token, "rpc/redeem_promo_code", { code });
      expect(response.status).toBe(200);
      return ((await response.json()) as { status: string }).status;
    }),
  );
  expect(results.filter((s) => s === "granted")).toHaveLength(1);
  expect(results.filter((s) => s === "exhausted")).toHaveLength(5);
});
