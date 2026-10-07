import { expect, test } from "@playwright/test";

test.describe("search", () => {
  test("explains short queries and empty results honestly", async ({ page }) => {
    await page.goto("/szukaj");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Szukaj");
    await expect(page.getByText(/Niezależni artyści z całego świata/)).toBeVisible();

    await page.getByRole("searchbox", { name: "Szukaj artystów, wydawnictw i utworów" }).fill("x");
    await page.getByRole("button", { name: "Szukaj" }).click();
    await expect(page.getByText("Wpisz co najmniej 2 znaki.")).toBeVisible();

    await page.goto(`/szukaj?q=${encodeURIComponent("Żźółćqwvx zzqq")}`);
    await expect(page.getByRole("status")).toHaveText(
      "Nic nie znaleźliśmy dla „Żźółćqwvx zzqq”. Sprawdź pisownię albo wpisz krótszy fragment.",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
