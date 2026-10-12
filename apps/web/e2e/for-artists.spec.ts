import { expect, test } from "@playwright/test";

test("artists learn what Tunewick offers and how to start", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("footer.site-footer")
    .getByRole("link", { name: "Dla artystów", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dla-artystow$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Twoja muzyka odkryta przez ludzi, którzy jej szukają",
  );
  await expect(page.getByRole("heading", { name: "Prawa zostają przy Tobie" })).toBeVisible();
  await page.getByText("Ile to kosztuje?").click();
  await expect(page.getByText(/W becie publikowanie jest bezpłatne/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Załóż konto" }).first()).toHaveAttribute(
    "href",
    /rejestracja|signup/,
  );
});
