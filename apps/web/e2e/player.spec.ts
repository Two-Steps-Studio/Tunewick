import { expect, test, type Page } from "@playwright/test";

// Drives the real engine on /dev/player with the sweep album made by the audio worker
// (pnpm dev:media, Docker). The web server runs with TUNEWICK_DEV_PAGES=1.

interface Debug {
  status: string;
  index: number;
  tier?: string;
  strategy: "mse" | "native" | null;
  mediaDuration: number;
  buffered: [number, number][];
  sessionTracks: number[];
}

async function debug(page: Page): Promise<Debug> {
  return JSON.parse((await page.getByTestId("player-debug").textContent()) || "{}") as Debug;
}

async function playAlbum(page: Page, setting: string, entitlement = "hires") {
  await page.goto("/dev/player");
  test.skip(
    (await page.getByText("No test album yet").count()) > 0,
    "Run pnpm dev:media to render the test album",
  );
  await page.getByTestId("setting").selectOption(setting);
  await page.getByTestId("entitlement").selectOption(entitlement);
  await page.getByRole("button", { name: "Play album" }).click();
  await expect.poll(async () => (await debug(page)).status, { timeout: 15_000 }).toBe("playing");
}

const player = (page: Page) => page.getByRole("region", { name: "Odtwarzacz" });

for (const [setting, codec] of [
  ["lossless", "FLAC 16/48"],
  ["high", "AAC 256 kbps"],
] as const) {
  test(`${setting}: three tracks play gapless from one continuous buffer`, async ({ page }) => {
    await playAlbum(page, setting);
    // Everything is appended into one MediaSource: a single range of exactly the music
    // (AAC priming/padding trimmed — untrimmed it would be ~30.06 s with holes).
    await expect
      .poll(async () => {
        const d = await debug(page);
        return { strategy: d.strategy, tracks: d.sessionTracks, ranges: d.buffered.length };
      })
      .toEqual({ strategy: "mse", tracks: [0, 1, 2], ranges: 1 });
    await expect.poll(async () => (await debug(page)).buffered[0]?.[1] ?? 0).toBeGreaterThan(29.99);
    const { mediaDuration, tier } = await debug(page);
    expect(mediaDuration).toBeCloseTo(30, 2);
    expect(tier).toBe(setting);
    await expect(player(page).locator(".player-bar__quality")).toHaveAttribute(
      "title",
      new RegExp(codec),
    );

    // Crossing a track boundary keeps playing in the same buffer and updates the track.
    await player(page).getByRole("slider", { name: "Pozycja w utworze" }).focus();
    await page.keyboard.press("End");
    await expect(player(page).getByText("Sweep 2")).toBeVisible();
    await expect
      .poll(async () => {
        const d = await debug(page);
        return { index: d.index, ranges: d.buffered.length };
      })
      .toEqual({ index: 1, ranges: 1 });
  });
}

test("Hi-Res plays as plain FLAC and says so honestly", async ({ page }) => {
  await playAlbum(page, "hires");
  const d = await debug(page);
  expect(d.tier).toBe("hires");
  expect(d.strategy).toBe("native");
  const chip = player(page).locator(".quality-chip");
  await expect(chip).toContainText("Hi-Res");
  await expect(chip).toContainText("Źródło FLAC 24/96, odtwarzane FLAC 24/96");

  await player(page).getByRole("button", { name: "Następny utwór" }).click();
  await expect(player(page).getByText("Sweep 2")).toBeVisible();
  await expect.poll(async () => (await debug(page)).status).toBe("playing");
});

test("Free plan gets High and the player says why", async ({ page }) => {
  await playAlbum(page, "auto", "high");
  expect((await debug(page)).tier).toBe("high");
  await expect(player(page).locator(".quality-chip")).toContainText("High");
  await expect(player(page).locator(".player-bar__quality")).toHaveAttribute(
    "title",
    /AAC 256 kbps/,
  );
  await expect(player(page).getByText("Lossless i Hi-Res w Premium")).toBeAttached();
});
