import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { countryName, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { coverForCard, getSharedSong, qrDataUrl, songCard } from "@/modules/discover";

/** Song share card: ?format=story (1080×1920) | square (1080×1080), ?locale=pl|en. */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/cards/song/[code]">,
) {
  const { code } = await params;
  if (!/^[a-z2-9]{10}$/.test(code)) return new NextResponse(null, { status: 404 });
  const search = request.nextUrl.searchParams;
  const format = search.get("format") === "square" ? "square" : "story";
  const requested = search.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;
  const data = await getSharedSong(code, 1280);
  if (!data) return new NextResponse(null, { status: 404 });
  const t = await getTranslations({ locale, namespace: "Song" });
  const path = `/song/${data.artist.slug}/${songSegment(data.track.title, data.track.code, slugify)}`;
  return songCard(
    {
      title: data.track.title,
      artist: data.artist.name,
      place: [
        data.artist.city,
        data.artist.countryCode ? countryName(data.artist.countryCode, locale) : null,
      ]
        .filter(Boolean)
        .join(", "),
      cover: await coverForCard(data.cover?.src ?? null, format === "story" ? 860 : 560),
      color: data.cover?.color ?? null,
      tagline: t("cardTagline"),
      cta: t("cardCta"),
      url: `${request.nextUrl.host}${path}`,
      qr: await qrDataUrl(`${request.nextUrl.origin}${path}`),
    },
    format,
  );
}
