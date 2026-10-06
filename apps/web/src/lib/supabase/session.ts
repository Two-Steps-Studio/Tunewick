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
  // (aal1) session is sent to the verification page. This redirect is a convenience — the database
  // refuses every API request of such a session anyway (public.enforce_mfa) — so whether the
  // account has a factor (asked from the Auth server, never from the unsigned cookie user object)
  // may be remembered for a few minutes in MFA_HINT_COOKIE. A forged hint can only skip the
  // redirect, not unlock data.
  const pathname = request.nextUrl.pathname;
  const userId = data.claims.sub;
  if (data.claims.aal !== "aal2" && !isVerifyPath(pathname)) {
    const hint = request.cookies.get(MFA_HINT_COOKIE)?.value;
    let hasFactor: boolean;
    if (hint?.startsWith(`${userId}:`)) {
      hasFactor = hint.endsWith(":1");
    } else {
      hasFactor = await hasVerifiedFactor(supabase);
      response.cookies.set(MFA_HINT_COOKIE, `${userId}:${hasFactor ? 1 : 0}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: MFA_HINT_SECONDS,
      });
    }
    if (!hasFactor) return response;
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

/** Remembered answer to "does this account have a verified factor?" — see refreshSession. */
export const MFA_HINT_COOKIE = "tw_mfa_hint";
const MFA_HINT_SECONDS = 10 * 60;

async function hasVerifiedFactor(supabase: ReturnType<typeof createServerClient<Database>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.factors?.some((factor) => factor.status === "verified") ?? false;
}

/** Localized paths of the second-factor page (see routing pathnames "/verify"). */
function isVerifyPath(pathname: string) {
  return pathname === "/weryfikacja" || pathname === "/en/verify" || pathname === "/pl/weryfikacja";
}
