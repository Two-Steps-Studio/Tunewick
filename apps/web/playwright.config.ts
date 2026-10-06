import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  // Creates closed-beta invite codes in the local Supabase (requires pnpm db:start).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // On CI failures also become GitHub annotations (readable without signing in to see logs).
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  retries: process.env.CI ? 1 : 0,
  // Polish browser locale: the proxy redirects English browsers from / to /en (locale detection).
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry", locale: "pl-PL" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    // The player engine also runs in Gecko (MSE FLAC ≤ 48 kHz, native Hi-Res — spike M3.0).
    {
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: /player\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // Enables /dev/player (test album from `pnpm dev:media`) in the production build.
    env: { TUNEWICK_DEV_PAGES: "1" },
  },
});
