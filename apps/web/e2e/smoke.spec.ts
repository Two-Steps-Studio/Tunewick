import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", heading: "Odkrywaj", lang: "pl" },
  { path: "/scena", heading: "Scena", lang: "pl" },
  { path: "/szukaj", heading: "Szukaj", lang: "pl" },
  { path: "/biblioteka", heading: "Biblioteka", lang: "pl" },
  { path: "/en", heading: "Discover", lang: "en" },
  { path: "/en/scene", heading: "Scene", lang: "en" },
  { path: "/en/search", heading: "Search", lang: "en" },
  { path: "/en/library", heading: "Library", lang: "en" },
];

for (const { path, heading, lang } of pages) {
  test(`${path} renders in ${lang} without horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test("navigation marks the current page and keeps the player region", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Nawigacja główna" });
  await nav.getByRole("link", { name: "Scena" }).click();
  await expect(page).toHaveURL(/\/scena$/);
  await expect(nav.getByRole("link", { name: "Scena" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Odtwarzacz" })).toBeVisible();
});

test("language switch keeps the localized page", async ({ page }) => {
  await page.goto("/scena");
  await page.getByRole("link", { name: /^EN/ }).click();
  await expect(page).toHaveURL(/\/en\/scene$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scene");
});

test("skip link moves focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Przejdź do treści" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("unknown paths show the localized not-found page", async ({ page }) => {
  const response = await page.goto("/nie-ma-takiej-strony");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nie ma takiej strony");
});

test.describe("locale detection", () => {
  test.use({ locale: "en-US" });

  test("English browsers are redirected from / to /en", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Discover");
  });
});
