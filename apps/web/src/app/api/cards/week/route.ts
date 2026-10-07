import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { formatListening } from "@/lib/intl";
import { statsCard } from "@/modules/discover";
import { getMyWeeklyRecap } from "@/modules/progress";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** "My Tunewick week" card of the signed-in listener: ?format=story|square, ?locale=. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new NextResponse(null, { status: 401 });
  const search = request.nextUrl.searchParams;
  const format = search.get("format") === "square" ? "square" : "story";
  const requested = search.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "You.card" });
  const recap = await getMyWeeklyRecap(1);
  const number = new Intl.NumberFormat(locale);
  return statsCard(
    {
      heading: t("heading"),
      lines: [
        { value: formatListening(Number(recap.listening_ms)), label: t("listening") },
        { value: number.format(recap.songs), label: t("songs") },
        { value: number.format(recap.new_artists), label: t("artists") },
        { value: number.format(recap.countries), label: t("countries") },
      ],
      question: t("question"),
      url: request.nextUrl.host,
    },
    format,
  );
}
