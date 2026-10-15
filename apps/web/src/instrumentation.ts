import type { Instrumentation } from "next";

// Server errors (rendering, route handlers, actions) go to private.app_errors through the
// report_error function - the same place the browser reports to (docs/deployment.md, "Error reports"). Only the
// message, the first stack lines and the path without its query; never who.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = (err as { digest?: string } | null)?.digest;
  // notFound(), redirect() and friends are control flow, not errors.
  if (digest?.startsWith("NEXT_")) return;
  const stack = (error.stack ?? "").split("\n").slice(0, 6).join("\n");
  try {
    await fetch(`${url}/rest/v1/rpc/report_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "server",
        message: error.message,
        detail: [stack, `${request.method} · ${context.routeType} · ${context.routePath}`]
          .concat(digest ? [`digest ${digest}`] : [])
          .join("\n"),
        path: request.path,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Reporting must never make things worse.
  }
};
