import { expect, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

test("visitors are asked to sign in for their recap", async ({ page }) => {
  await page.goto("/ty/podsumowanie");
  await expect(
    page.getByRole("heading", { name: "Podsumowanie miesiąca", level: 1 }),
  ).toBeVisible();
});

test("a new listener's month: honest empty state, months to browse, cards need a sign-in", async ({
  page,
  request,
}) => {
  await createConfirmedUser(page, "recap");
  await page.goto("/ty");
  await page.getByRole("link", { name: "Podsumowanie miesiąca →" }).click();
  await expect(page).toHaveURL(/\/ty\/podsumowanie$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Twój /);
  // Joined today: last month is outside their months, this month has nothing yet.
  await expect(page.getByText("Dla tego miesiąca nie ma podsumowania.")).toBeVisible();
  await page.getByRole("link", { name: "Następny miesiąc →" }).click();
  await expect(page.getByText(/W tym miesiącu nic nie słuchano/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Następny miesiąc →" })).toHaveCount(0);
  // Cards are private: anonymous requests are refused.
  const month = new Date().toISOString().slice(0, 7);
  const anonymous = await request.get(`/api/cards/recap?month=${month}&kind=summary`, {
    headers: { cookie: "" },
  });
  expect(anonymous.status()).toBe(401);
});
