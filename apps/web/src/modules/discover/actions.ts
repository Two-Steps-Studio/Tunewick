"use server";

import { isDiscoveryMode, type DiscoveryMode } from "@tunewick/shared";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayableTracks, listenerEntitlement } from "@/modules/audio";
import { getImageSourcesMany, type ImageSources } from "@/modules/images";
import type { PlayerTrack } from "@/modules/player";
import { VISITOR_COOKIE } from "./preferences";

/**
 * Like a track / follow an artist from the feed — the Library's tables and RLS rules, without
 * refreshing the page (the feed keeps its place). Returns the state the database now has.
 */
export async function setFeedReaction(kind: "like" | "follow", id: string, on: boolean) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, on: !on };
  const supabase = await createSupabaseServerClient();
  const { error } =
    kind === "like"
      ? on
        ? await supabase.from("track_likes").insert({ track_id: id })
        : await supabase.from("track_likes").delete().eq("track_id", id)
      : on
        ? await supabase.from("artist_follows").insert({ artist_id: id })
        : await supabase.from("artist_follows").delete().eq("artist_id", id);
  if (error && error.code !== "23505") return { ok: false as const, on: !on };
  return { ok: true as const, on };
}

/**
 * Save to (or remove from) the listener's crate. Returns the state the database now has and the
 * points the save earned (0 when the song was saved before — saving pays once per song).
 */
export async function setTrackSaved(trackId: string, on: boolean) {
  if (!z.uuid().safeParse(trackId).success) return { ok: false as const, on: !on, points: 0 };
  const supabase = await createSupabaseServerClient();
  const { error } = on
    ? await supabase.from("track_saves").insert({ track_id: trackId })
    : await supabase.from("track_saves").delete().eq("track_id", trackId);
  if (error && error.code !== "23505") return { ok: false as const, on: !on, points: 0 };
  if (!on || error) return { ok: true as const, on, points: 0 };
  const { data } = await supabase
    .from("discovery_points")
    .select("points, created_at")
    .eq("kind", "save")
    .eq("award_key", trackId)
    .maybeSingle();
  const fresh = data && Date.now() - Date.parse(data.created_at) < 60_000;
  return { ok: true as const, on, points: fresh ? data.points : 0 };
}

const preferencesSchema = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  genreIds: z.array(z.number().int().positive()).max(12),
  languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).max(8),
  mode: z.string().refine(isDiscoveryMode),
  artistIds: z.array(z.uuid()).max(20).default([]),
  timeZone: z.string().max(64).optional(),
  hideExplicit: z.boolean().default(false),
  showInRankings: z.boolean().default(true),
  explorationShare: z.number().min(0.1).max(0.4).optional(),
});

export type PreferencesInput = z.input<typeof preferencesSchema>;

/**
 * Onboarding / discovery settings. Accounts: stored in listener_preferences and the chosen
 * artists followed. Visitors: a cookie only (a year), nothing server-side.
 */
export async function saveDiscoveryPreferences(input: PreferencesInput) {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  const value = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();

  if (!auth?.claims) {
    (await cookies()).set(
      VISITOR_COOKIE,
      JSON.stringify({
        c: value.countryCode,
        g: value.genreIds,
        l: value.languages,
        m: value.mode,
        x: value.hideExplicit,
      }),
      { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", httpOnly: true, secure: true },
    );
    return { ok: true as const };
  }

  const row = {
    country_code: value.countryCode,
    genre_ids: value.genreIds,
    content_languages: value.languages,
    discovery_mode: value.mode as DiscoveryMode,
    hide_explicit: value.hideExplicit,
    show_in_rankings: value.showInRankings,
    onboarded_at: new Date().toISOString(),
    ...(value.explorationShare !== undefined ? { exploration_share: value.explorationShare } : {}),
    ...(value.timeZone ? { time_zone: value.timeZone } : {}),
  };
  let { error } = await supabase
    .from("listener_preferences")
    .upsert(row, { onConflict: "user_id" });
  // An unknown time zone (old browser) is not worth failing onboarding for.
  if (error?.code === "22023" && value.timeZone) {
    ({ error } = await supabase
      .from("listener_preferences")
      .upsert({ ...row, time_zone: "UTC" }, { onConflict: "user_id" }));
  }
  if (error) return { ok: false as const };
  if (value.artistIds.length) {
    await supabase.from("artist_follows").upsert(
      value.artistIds.map((artist_id) => ({ artist_id })),
      { onConflict: "user_id,artist_id", ignoreDuplicates: true },
    );
  }
  // The interface language follows the onboarding choice.
  const locale = value.languages.find((l) => (routing.locales as readonly string[]).includes(l));
  if (locale)
    await supabase.from("profile_settings").update({ locale }).eq("user_id", auth.claims.sub);
  refresh();
  return { ok: true as const };
}

/** The whole release of a feed track, ready for the main player, starting at that track. */
export async function getFullPlayback(trackId: string): Promise<{
  tracks: PlayerTrack[];
  index: number;
  entitlement: Awaited<ReturnType<typeof listenerEntitlement>>;
} | null> {
  if (!z.uuid().safeParse(trackId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: track } = await supabase
    .from("tracks")
    .select("id, release_id, release:releases(id, artist:artists!releases_artist_id_fkey(name))")
    .eq("id", trackId)
    .maybeSingle();
  if (!track?.release?.artist) return null;
  const { data: releaseTracks, error } = await supabase
    .from("tracks")
    .select("id, title")
    .eq("release_id", track.release_id)
    .order("disc_number")
    .order("track_number");
  if (error) return null;
  const entitlement = await listenerEntitlement();
  const tracks = await getPlayableTracks(
    track.release_id,
    releaseTracks,
    track.release.artist.name,
    entitlement,
  );
  const index = tracks.findIndex((t) => t.id === trackId);
  return index === -1 ? null : { tracks, index, entitlement };
}

export interface SuggestedArtist {
  id: string;
  slug: string;
  name: string;
  countryCode: string | null;
  image: ImageSources | null;
}

/** Artists to offer during onboarding for the chosen genres and country (public data only). */
export async function suggestArtists(
  genreIds: number[],
  countryCode: string | null,
): Promise<SuggestedArtist[]> {
  const genres = z.array(z.number().int().positive()).max(12).safeParse(genreIds);
  const country = z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .safeParse(countryCode);
  if (!genres.success || !country.success) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("onboarding_artists", {
    genres: genres.data,
    country: country.data ?? undefined,
    max_results: 12,
  });
  if (error || !data) return [];
  const images = await getImageSourcesMany(
    data.map((a) => a.image_id),
    160,
  );
  return data.map((a) => ({
    id: a.artist_id,
    slug: a.artist_slug,
    name: a.name,
    countryCode: a.country_code,
    image: a.image_id ? (images.get(a.image_id) ?? null) : null,
  }));
}
