import "server-only";

import { previewWindow, type Json } from "@tunewick/shared";
import { presignVariantGet } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getImageSources } from "@/modules/images";
import type { FeedItem } from "./types";

/** The code at the end of a song URL segment ("title-slug-ab2cd3ef4g" → "ab2cd3ef4g"). */
export function parseSongSegment(segment: string): string | null {
  const code = decodeURIComponent(segment).split("-").at(-1) ?? "";
  return /^[a-z2-9]{10}$/.test(code) ? code : null;
}

/**
 * A public song by its share code, with its preview — for the share page, OG image and cards.
 * Only released music (RLS + explicit check); null for anything else.
 */
export async function getSharedSong(code: string, coverWidth = 1280) {
  const supabase = await createSupabaseServerClient();
  const { data: track } = await supabase
    .from("tracks")
    .select(
      "id, title, duration_ms, explicit, public_code, release:releases(id, slug, title, status, publish_at, artwork_image_id, artist:artists!releases_artist_id_fkey(id, slug, name, city, country_code, image_id, verification_status, status))",
    )
    .eq("public_code", code)
    .maybeSingle();
  const release = track?.release;
  const artist = release?.artist;
  if (
    !track ||
    !release ||
    !artist ||
    release.status !== "published" ||
    !release.publish_at ||
    Date.parse(release.publish_at) > Date.now() ||
    artist.status !== "active"
  ) {
    return null;
  }
  const [previews, cover] = await Promise.all([
    supabase.rpc("track_previews", { tracks: [track.id] }),
    getImageSources(release.artwork_image_id ?? artist.image_id, coverWidth),
  ]);
  const row = previews.data?.[0];
  const variants = (
    (row?.variants ?? []) as Json as unknown as { tier: string; object_key: string }[]
  ).filter(
    (v): v is { tier: "data_saver" | "high"; object_key: string } =>
      v.tier === "data_saver" || v.tier === "high",
  );
  const sources: FeedItem["preview"]["sources"] = [];
  for (const variant of variants) {
    const url = await presignVariantGet(variant.object_key);
    if (url) sources.push({ tier: variant.tier, url });
  }
  return {
    track: { id: track.id, title: track.title, code: track.public_code, explicit: track.explicit },
    release: { id: release.id, slug: release.slug, title: release.title },
    artist: {
      id: artist.id,
      slug: artist.slug,
      name: artist.name,
      city: artist.city,
      countryCode: artist.country_code,
      verified: artist.verification_status === "verified",
    },
    cover,
    preview: {
      ...previewWindow(
        row?.duration_ms ?? track.duration_ms,
        row?.preview_start_ms ?? null,
        row?.preview_duration_ms ?? null,
        row?.suggested_start_ms ?? null,
      ),
      sources,
    },
  };
}

export type SharedSong = NonNullable<Awaited<ReturnType<typeof getSharedSong>>>;
