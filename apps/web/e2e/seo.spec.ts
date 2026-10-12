import { expect, test } from "@playwright/test";

test("robots.txt opens public pages and closes private ones", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /ustawienia");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("the sitemap lists public pages with their language versions", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml).toContain("<urlset");
  expect(xml).toMatch(/<loc>[^<]*\/listy<\/loc>/);
  expect(xml).toMatch(/hreflang="en" href="[^"]*\/en\/charts"/);
});

test("public pages have a canonical URL, language versions and a link preview", async ({
  page,
}) => {
  await page.goto("/listy");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/listy$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    /\/en\/charts$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    "href",
    /\/listy$/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /opengraph-image/,
  );
});
