import { expect, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

test("visitors are asked to sign in for statistics", async ({ page }) => {
  await page.goto("/ty/statystyki");
  await expect(page.getByRole("heading", { name: "Twoje statystyki", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zaloguj się" }).last()).toBeVisible();
});

test("a new listener sees periods and an honest empty state", async ({ page }) => {
  await createConfirmedUser(page, "stats");
  await page.goto("/ty");
  await page.getByRole("link", { name: "Więcej statystyk →" }).click();
  await expect(page).toHaveURL(/\/ty\/statystyki$/);
  await expect(page.getByRole("heading", { name: "Twoje statystyki", level: 1 })).toBeVisible();
  await expect(page.getByText(/W tym okresie jeszcze nic nie słuchano/)).toBeVisible();
  await page.getByRole("link", { name: "Ten rok" }).click();
  await expect(page).toHaveURL(/period=year/);
  await expect(page.getByRole("link", { name: "Ten rok" })).toHaveAttribute("aria-current", "page");
});
