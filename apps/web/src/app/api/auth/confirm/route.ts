import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { type AppPathname, routing } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Email links (confirmation, password recovery) land here with a one-time token hash.
// Lives under /api so the locale proxy does not rewrite it.
const ALLOWED_TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery"];
const ALLOWED_NEXT: readonly AppPathname[] = ["/", "/update-password"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") as AppPathname | null;
  const next = nextParam && ALLOWED_NEXT.includes(nextParam) ? nextParam : "/";

  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, cookieLocale) ? cookieLocale : routing.defaultLocale;
  const to = (href: AppPathname, query?: Record<string, string>) =>
    NextResponse.redirect(
      new URL(getPathname({ href: { pathname: href, query }, locale }), request.url),
    );

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type)) {
    return to("/login", { error: "linkInvalid" });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return to("/login", { error: "linkInvalid" });

  return to(next);
}
