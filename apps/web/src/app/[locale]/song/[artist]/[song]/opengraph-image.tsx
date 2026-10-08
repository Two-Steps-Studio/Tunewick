import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { countryName } from "@/lib/intl";
import {
  CARD_SIZES,
  coverForCard,
  getSharedSong,
  parseSongSegment,
  songCard,
} from "@/modules/discover";

export const size = CARD_SIZES.og;
export const contentType = "image/png";
export const alt = "Tunewick";

/** Link previews (Discord, X, iMessage, WhatsApp…): artwork, title, artist, Tunewick. */
export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; song: string }>;
}) {
  const { locale, song } = await params;
  const code = parseSongSegment(song);
  const data = code ? await getSharedSong(code, 640) : null;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Song" });
  return songCard(
    {
      title: data?.track.title ?? "Tunewick",
      artist: data?.artist.name ?? "",
      place: data?.artist.countryCode ? countryName(data.artist.countryCode, locale) : "",
      cover: await coverForCard(data?.cover?.src ?? null, 470),
      color: data?.cover?.color ?? null,
      tagline: t("cardTagline"),
      cta: t("cardCta"),
      url: "tunewick.com",
    },
    "og",
  );
}
