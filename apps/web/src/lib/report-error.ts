/**
 * Sends a browser error to /api/errors (grouped and capped in the database). At most a few per
 * page load, never errors from browser extensions or known harmless browser noise.
 */
let sent = 0;
const MAX_PER_PAGE = 5;
const NOISE = [/ResizeObserver loop/, /^Script error\.?$/, /Load failed$/, /AbortError/];

export function reportClientError(error: unknown, extra?: string) {
  if (typeof window === "undefined" || sent >= MAX_PER_PAGE) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const stack = err.stack ?? "";
  if (/(chrome|moz|safari)-extension:\/\//.test(stack)) return;
  if (NOISE.some((pattern) => pattern.test(err.message))) return;
  sent += 1;
  const body = JSON.stringify({
    message: err.message.slice(0, 2000),
    detail: [stack.split("\n").slice(0, 6).join("\n"), extra, navigator.userAgent]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000),
    path: location.pathname,
  });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/errors", blob)) {
      void fetch("/api/errors", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {}
}
