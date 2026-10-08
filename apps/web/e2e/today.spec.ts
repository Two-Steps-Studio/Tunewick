import { expect, test } from "@playwright/test";
import { createConfirmedUser } from "./helpers";

test("visitors get Surprise Me journeys and a sign-in for their daily picks", async ({ page }) => {
  await page.goto("/dzis");
  await expect(page.getByRole("heading", { name: "Dziś", level: 1 })).toBeVisible();
  await expect(page.getByText(/Zaloguj się, żeby dostawać Daily Discovery/)).toBeVisible();
  await page
    .getByRole("link", { name: /Underground/ })
    .first()
    .click();
  await expect(page).toHaveURL(/journey=underground/);
  await expect(page.getByRole("button", { name: "Wróć do swojego feedu" })).toHaveText(
    /Underground/,
  );
});

test("a listener's Today: Daily Discovery and Weekly Drop, or an honest empty state", async ({
  page,
}) => {
  await createConfirmedUser(page, "today");
  await page.goto("/dzis");
  await expect(page.getByRole("heading", { name: "Dziś", level: 1 })).toBeVisible();
  const daily = page.getByRole("region", { name: "Dziesięć nowych utworów na dziś" });
  const empty = page.getByText(/Teraz nie ma z czego wybrać nowej muzyki/);
  await expect(daily.or(empty)).toBeVisible();
  if (await daily.isVisible()) {
    await expect(daily.getByRole("progressbar")).toBeVisible();
    // The set is stable: reloading shows the same songs.
    const first = await daily.getByRole("listitem").first().textContent();
    await page.reload();
    await expect(daily.getByRole("listitem").first()).toHaveText(first ?? "");
  }
  await expect(page.getByRole("link", { name: /Poza moim gustem/ })).toBeVisible();
});
