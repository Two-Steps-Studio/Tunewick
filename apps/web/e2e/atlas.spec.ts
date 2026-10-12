import { expect, test } from "@playwright/test";

test("the music map lists countries as text, with or without a map", async ({ page }) => {
  await page.goto("/atlas");
  await expect(page.getByRole("heading", { name: "Mapa muzyki", level: 1 })).toBeVisible();
  const map = page.getByRole("img", { name: /Mapa świata/ });
  const empty = page.getByText("Żaden kraj nie ma jeszcze opublikowanej muzyki.");
  await expect(map.or(empty)).toBeVisible();
  if (await map.isVisible()) {
    // Every country on the map is also a plain link in the list below it.
    await expect(page.getByRole("list").first().getByRole("link").first()).toBeVisible();
  }
});

test("unknown countries and cities have no page", async ({ page }) => {
  for (const path of ["/atlas/xx", "/atlas/pl/nie-ma-takiego-miasta"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Nie ma takiej strony", level: 1 }),
    ).toBeVisible();
  }
});
