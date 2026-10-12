import { discoveryScore } from "@tunewick/shared";
import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { formatListening } from "@/lib/intl";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { coverForCard, highlightCard, qrDataUrl, statsCard } from "@/modules/discover";
import { getImageSources } from "@/modules/images";
import { getMyMonthRecap, parseMonth } from "@/modules/progress";

const KINDS = ["summary", "artist", "song", "discovery", "score"] as const;
type Kind = (typeof KINDS)[number];

/**
 * The signed-in listener's month as a share card:
 * ?month=YYYY-MM&kind=summary|artist|song|discovery|score&format=story|square&locale=.
 * Only from their own recap; 404 when the month has nothing to show for that kind.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new NextResponse(null, { status: 401 });
  const search = request.nextUrl.searchParams;
  const month = parseMonth(search.get("month"));
  const kind = KINDS.find((k) => k === search.get("kind")) ?? ("summary" as Kind);
  if (!month) return new NextResponse(null, { status: 400 });
  const format = search.get("format") === "square" ? "square" : "story";
  const requested = search.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;

  const recap = await getMyMonthRecap(month);
  if (!recap || Number(recap.plays) === 0) return new NextResponse(null, { status: 404 });
  const t = await getTranslations({ locale, namespace: "Recap.card" });
  const number = new Intl.NumberFormat(locale);
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T12:00:00Z`));
  const common = {
    heading: t("heading", { month: monthName }).toUpperCase(),
    question: t("question"),
    url: request.nextUrl.host,
    qr: await qrDataUrl(request.nextUrl.origin),
  };
  const cover = async (imageId: string | null, size: number) =>
    coverForCard((await getImageSources(imageId, size))?.src ?? null, size);

  switch (kind) {
    case "summary":
      return statsCard(
        {
          ...common,
          lines: [
            { value: formatListening(Number(recap.listening_ms)), label: t("listening") },
            { value: number.format(Number(recap.tracks)), label: t("songs") },
            { value: number.format(Number(recap.new_artists)), label: t("newArtists") },
            { value: number.format(Number(recap.countries)), label: t("countries") },
          ],
        },
        format,
      );
    case "score": {
      const score = discoveryScore(Number(recap.discovery_xp), recap.genre_spread);
      return statsCard(
        {
          ...common,
          lines: [
            { value: number.format(score), label: t("score") },
            { value: number.format(Number(recap.new_songs)), label: t("newSongs") },
            { value: number.format(Number(recap.underground)), label: t("underground") },
          ],
        },
        format,
      );
    }
    case "artist": {
      const top = recap.top_artists[0];
      if (!top) return new NextResponse(null, { status: 404 });
      return highlightCard(
        {
          ...common,
          kicker: t("topArtist"),
          title: top.name,
          subtitle: t("plays", { count: Number(top.plays) }),
          cover: await cover(top.image_id, 720),
          round: true,
        },
        format,
      );
    }
    case "song": {
      const top = recap.top_tracks[0];
      if (!top) return new NextResponse(null, { status: 404 });
      return highlightCard(
        {
          ...common,
          kicker: t("topSong"),
          title: top.title,
          subtitle: `${top.artist} · ${t("plays", { count: Number(top.plays) })}`,
          cover: await cover(top.artwork_image_id, 720),
        },
        format,
      );
    }
    case "discovery": {
      const found = recap.biggest_discovery;
      if (!found) return new NextResponse(null, { status: 404 });
      return highlightCard(
        {
          ...common,
          kicker: t("discovery"),
          title: found.name,
          subtitle: t("since", { time: formatListening(Number(found.ms)) }),
          cover: await cover(found.image_id, 720),
          round: true,
        },
        format,
      );
    }
  }
}
