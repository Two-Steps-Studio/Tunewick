import { defineConfig, devices } from "@playwright/test";

// Runs the playback spike page in the three engines Playwright ships. These are engine builds,
// not branded browsers (e.g. Playwright WebKit on Windows is not Safari) — results are indicative;
// real Safari/iOS/Android are tested manually with the same page.
export default defineConfig({
  testDir: ".",
  testMatch: "spike.spec.ts",
  timeout: 120_000,
  reporter: "line",
  use: { baseURL: "http://localhost:4180" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: { firefoxUserPrefs: { "media.autoplay.default": 0 } },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx -y serve . -l 4180",
    url: "http://localhost:4180",
    reuseExistingServer: true,
  },
});
