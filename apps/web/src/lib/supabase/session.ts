import { createServerClient } from "@supabase/ssr";
import type { Database } from "@tunewick/shared";
import { type NextRequest, NextResponse } from "next/server";
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
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return response;

  // Accounts with a verified second factor must finish it before using the app:
  // a password-only (aal1) session is sent to the verification page.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const pathname = request.nextUrl.pathname;
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" && !isVerifyPath(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname =
      pathname === "/en" || pathname.startsWith("/en/") ? "/en/verify" : "/weryfikacja";
    target.search = `?next=${encodeURIComponent(pathname)}`;
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  return response;
}

/** Localized paths of the second-factor page (see routing pathnames "/verify"). */
function isVerifyPath(pathname: string) {
  return pathname === "/weryfikacja" || pathname === "/en/verify" || pathname === "/pl/weryfikacja";
}
