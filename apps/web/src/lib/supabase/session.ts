import { createServerClient } from "@supabase/ssr";
import type { Database } from "@tunewick/shared";
import type { NextRequest, NextResponse } from "next/server";
import { supabaseConfig } from "./config";

/**
 * Refreshes the Supabase session cookie on the response produced by the rest of the proxy
 * (e.g. next-intl's rewrite/redirect). Must run on every page request.
 */
export async function refreshSession(request: NextRequest, response: NextResponse) {
  const { url, publishableKey } = supabaseConfig();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Triggers token refresh if needed; must run before the response is returned.
  await supabase.auth.getClaims();
  return response;
}
