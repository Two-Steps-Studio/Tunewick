import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { isSupabaseConfigured } from "./lib/supabase/config";
import { refreshSession } from "./lib/supabase/session";

const handleI18n = createMiddleware(routing);

// Shown instead of a bare 500 when a deployment was built without its Supabase variables.
const NOT_CONFIGURED = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tunewick</title><body style="font:16px/1.5 system-ui,sans-serif;background:#171515;color:#f2ebdd;max-width:36rem;margin:0 auto;padding:4rem 1rem"><h1 style="font-size:1.5rem">Tunewick</h1><p>Ta instancja nie jest jeszcze skonfigurowana. Wracamy wkrótce.</p><p lang="en" style="color:#9a928a">This deployment is not configured yet. Please check back soon.</p></body></html>`;

export default async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    console.error("Supabase is not configured for this deployment — see docs/deployment.md");
    return new Response(NOT_CONFIGURED, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "retry-after": "3600" },
    });
  }
  const response = handleI18n(request);
  return refreshSession(request, response);
}

export const config = {
  // Skip API routes, Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
