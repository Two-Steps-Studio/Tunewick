import "server-only";

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { countryName, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { type CardFormat, coverForCard, qrDataUrl, songCard } from "./cards";
import { getSharedSong } from "./song";

/**
 * A public song's share card (Open Graph, story or square) — the same image for the download link,
 * the Open Graph preview and the video clip. Null when the song is not public.
 */
export async function renderSongCard(
  code: string,
  format: Exclude<CardFormat, "og">,
  locale: Locale,
  origin: string,
) {
  const data = await getSharedSong(code, 1280);
  if (!data) return null;
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
      url: `${new URL(origin).host}${path}`,
      qr: await qrDataUrl(`${origin}${path}`),
    },
    format,
  );
}
