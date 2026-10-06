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

  // Accounts with a verified second factor must finish it before using the app: a password-only
  // (aal1) session is sent to the verification page. The level comes from the signed token; the
  // factors from the Auth server (the user object stored in the cookie is not signed, so it is
  // never trusted). Sessions that are already aal2 skip the extra request. The database enforces
  // the same rule for every API call (public.enforce_mfa), so this is the friendly front door.
  const pathname = request.nextUrl.pathname;
  if (
    data.claims.aal !== "aal2" &&
    !isVerifyPath(pathname) &&
    (await hasVerifiedFactor(supabase))
  ) {
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

async function hasVerifiedFactor(supabase: ReturnType<typeof createServerClient<Database>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.factors?.some((factor) => factor.status === "verified") ?? false;
}

/** Localized paths of the second-factor page (see routing pathnames "/verify"). */
function isVerifyPath(pathname: string) {
  return pathname === "/weryfikacja" || pathname === "/en/verify" || pathname === "/pl/weryfikacja";
}
