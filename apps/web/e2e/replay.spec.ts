import { expect, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

test("a new listener's Replay says honestly that there is no story yet", async ({ page }) => {
  await createConfirmedUser(page, "replay");
  await page.goto("/ty");
  await page.getByRole("link", { name: "Replay →" }).click();
  await expect(page).toHaveURL(/\/ty\/replay$/);
  const year = new Date().getFullYear();
  await expect(page.getByRole("heading", { name: `Replay ${year}`, level: 1 })).toBeVisible();
  await expect(page.getByText(/za mało słuchania na historię/)).toBeVisible();
  await expect(page.getByRole("link", { name: `${year} →` })).toHaveCount(0);
  await page.getByRole("link", { name: `← ${year - 1}` }).click();
  await expect(page.getByText("Dla tego roku nie ma Replay.")).toBeVisible();
});
