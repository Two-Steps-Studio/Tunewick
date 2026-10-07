// Performance budget check (M11.6, architecture.md §11) against a running production build:
//   pnpm --filter @tunewick/web build && pnpm --filter @tunewick/web start
//   node apps/web/scripts/perf-budget.mjs [baseUrl]
// Lab conditions approximate a mid-range phone on 4G: 4x CPU slowdown, 9 Mb/s down, 1.5 Mb/s up,
// 150 ms RTT, cold cache. Reports compressed JS per page and LCP; exits 1 when over budget.
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const BUDGET = { lcpMs: 2500, jsKb: 250 };
const PAGES = ["/", "/scena", "/szukaj", "/logowanie", "/biblioteka"];

const browser = await chromium.launch();
const results = [];
let failed = false;

for (const path of PAGES) {
  const context = await browser.newContext({ ...devices["Pixel 7"], locale: "pl-PL" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  let jsBytes = 0;
  const pending = [];
  page.on("requestfinished", (request) => {
    if (request.resourceType() !== "script") return;
    pending.push(
      request.sizes().then((s) => {
        jsBytes += s.responseBodySize;
      }),
    );
  });

  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(base + path, { waitUntil: "networkidle" });
  // LCP is final once the user interacts; a click on an empty area ends the observation.
  await page.mouse.click(1, 1);
  const lcp = Math.round(await page.evaluate(() => window.__lcp));
  await Promise.all(pending);
  const jsKb = Math.round(jsBytes / 1024);

  const over = lcp > BUDGET.lcpMs || jsKb > BUDGET.jsKb;
  failed ||= over;
  results.push({ page: path, "LCP ms": lcp, "JS kB (compressed)": jsKb, ok: over ? "OVER" : "ok" });
  await context.close();
}

await browser.close();
console.table(results);
console.log(
  `Budgets: LCP ≤ ${BUDGET.lcpMs} ms, JS ≤ ${BUDGET.jsKb} kB compressed per cold page load.`,
);
process.exit(failed ? 1 : 0);
