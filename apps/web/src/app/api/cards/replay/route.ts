import { discoveryScore } from "@tunewick/shared";
import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { qrDataUrl, statsCard } from "@/modules/discover";
import { getMyReplay } from "@/modules/progress";

/** The signed-in listener's Replay card: ?year=&format=story|square&locale=. Private. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new NextResponse(null, { status: 401 });
  const search = request.nextUrl.searchParams;
  const year = Number(search.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2999) {
    return new NextResponse(null, { status: 400 });
  }
  const format = search.get("format") === "square" ? "square" : "story";
  const requested = search.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;
  const replay = await getMyReplay(year);
  if (!replay || Number(replay.stats.plays) === 0) return new NextResponse(null, { status: 404 });
  const t = await getTranslations({ locale, namespace: "Replay.card" });
  const number = new Intl.NumberFormat(locale);
  const s = replay.stats;
  return statsCard(
    {
      heading: t("heading", { year }).toUpperCase(),
      lines: [
        { value: number.format(Math.round(Number(s.listening_ms) / 60000)), label: t("minutes") },
        {
          value: s.top_artists[0]?.name ?? number.format(Number(s.artists)),
          label: s.top_artists[0] ? t("topArtist") : t("artists"),
        },
        { value: number.format(Number(s.new_artists)), label: t("newArtists") },
        {
          value: number.format(discoveryScore(Number(s.discovery_xp), s.genre_spread)),
          label: t("score"),
        },
      ],
      question: t("question"),
      url: request.nextUrl.host,
      qr: await qrDataUrl(request.nextUrl.origin),
    },
    format,
  );
}
