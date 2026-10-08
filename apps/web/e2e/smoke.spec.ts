import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", heading: "Odkrywaj", lang: "pl" },
  { path: "/przegladaj", heading: "Przeglądaj", lang: "pl" },
  { path: "/ty", heading: "Ty", lang: "pl" },
  { path: "/rankingi", heading: "Rankingi", lang: "pl" },
  { path: "/scena", heading: "Scena", lang: "pl" },
  { path: "/szukaj", heading: "Szukaj", lang: "pl" },
  { path: "/biblioteka", heading: "Biblioteka", lang: "pl" },
  { path: "/en", heading: "Discover", lang: "en" },
  { path: "/en/browse", heading: "Browse", lang: "en" },
  { path: "/en/you", heading: "You", lang: "en" },
  { path: "/en/rankings", heading: "Rankings", lang: "en" },
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

test("browse narrows Poland to a voivodeship and says when it has nothing yet", async ({
  page,
}) => {
  await page.goto("/przegladaj?country=PL");
  const regions = page.getByRole("navigation", { name: "Województwo" });
  // No E2E fixture ever uses Lubuskie.
  await regions.getByRole("link", { name: "Lubuskie" }).click();
  await expect(page).toHaveURL(/\/przegladaj\?country=PL&woj=lubuskie$/);
  await expect(regions.getByRole("link", { name: "Lubuskie" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByText("Z województwa lubuskie nie ma jeszcze opublikowanej muzyki."),
  ).toBeVisible();
});

test("a first visit asks what to discover; skipping opens the feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Co chcesz odkrywać?" })).toBeVisible();
  await page.getByText("Rock", { exact: true }).click();
  await page.getByRole("button", { name: "Zacznij odkrywać" }).click();
  await expect(page.getByRole("navigation", { name: "Co odkrywać" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dla Ciebie" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The choice is remembered (a cookie for visitors): the next visit goes straight to the feed.
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Co odkrywać" })).toBeVisible();
});

test("rankings have a season and say when it ends", async ({ page }) => {
  await page.goto("/rankingi");
  await page.getByRole("link", { name: "Sezon", exact: true }).click();
  await expect(page).toHaveURL(/period=season/);
  await expect(page.getByText(/Sezon \d\/\d{4} kończy się/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Poprzedni sezon" })).toBeVisible();
});
