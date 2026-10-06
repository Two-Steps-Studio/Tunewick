import { writeFileSync } from "node:fs";
import { test } from "@playwright/test";

test("playback spike", async ({ page, browserName }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start tests" }).click();
  await page.waitForFunction(
    () => (window as unknown as { __results: unknown }).__results !== null,
    null,
    {
      timeout: 110_000,
    },
  );
  const results = await page.evaluate(
    () => (window as unknown as { __results: unknown }).__results,
  );
  writeFileSync(`results-${browserName}.json`, JSON.stringify(results, null, 2));
});
