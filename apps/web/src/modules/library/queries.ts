import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** What the signed-in listener liked on one release page (one round trip each, RLS: own rows). */
export async function getReleaseLikes(releaseId: string, trackIds: string[]) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const [release, tracks] = await Promise.all([
    supabase.from("release_likes").select("release_id").eq("release_id", releaseId).maybeSingle(),
    trackIds.length
      ? supabase.from("track_likes").select("track_id").in("track_id", trackIds)
      : Promise.resolve({ data: [] as { track_id: string }[], error: null }),
  ]);
  if (release.error) throw release.error;
  if (tracks.error) throw tracks.error;
  return {
    release: release.data !== null,
    tracks: new Set((tracks.data ?? []).map((t) => t.track_id)),
  };
}

/** Follower count (public, real) and whether the signed-in listener follows. */
export async function getArtistFollow(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  const [count, mine] = await Promise.all([
    supabase.rpc("artist_follower_count", { artist: artistId }),
    auth?.claims
      ? supabase.from("artist_follows").select("artist_id").eq("artist_id", artistId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (count.error) throw count.error;
  if (mine.error) throw mine.error;
  return { count: count.data ?? 0, following: auth?.claims ? mine.data !== null : null };
}

/**
 * The listener's library, newest first. Music that stopped being public (taken down, artist
 * suspended) drops out by itself: RLS hides it from the joins.
 */
export async function getLibrary() {
  const supabase = await createSupabaseServerClient();
  const [tracks, releases, artists] = await Promise.all([
    supabase
      .from("track_likes")
      .select(
        "created_at, track:tracks(id, title, duration_ms, track_number, release:releases(id, slug, title, status, publish_at, artist:artists!releases_artist_id_fkey(id, slug, name)))",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("release_likes")
      .select(
        "created_at, release:releases(id, slug, title, type, status, publish_at, artwork_image_id, artist:artists!releases_artist_id_fkey(slug, name))",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("artist_follows")
      .select("created_at, artist:artists(id, slug, name, image_id, city, voivodeship)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (tracks.error) throw tracks.error;
  if (releases.error) throw releases.error;
  if (artists.error) throw artists.error;

  const now = Date.now();
  const isPublic = (r: { status: string; publish_at: string | null } | null) =>
    r !== null &&
    r.status === "published" &&
    r.publish_at !== null &&
    Date.parse(r.publish_at) <= now;

  return {
    tracks: tracks.data.flatMap((row) =>
      row.track && row.track.release && isPublic(row.track.release) && row.track.release.artist
        ? [{ ...row.track, release: { ...row.track.release, artist: row.track.release.artist } }]
        : [],
    ),
    releases: releases.data.flatMap((row) =>
      row.release && isPublic(row.release) && row.release.artist
        ? [{ ...row.release, artist: row.release.artist }]
        : [],
    ),
    artists: artists.data.flatMap((row) => (row.artist ? [row.artist] : [])),
  };
}

/** Recently played tracks (last 90 days, one row per track), with what the library page shows. */
export async function getRecentlyPlayed() {
  const supabase = await createSupabaseServerClient();
  const { data: recent, error } = await supabase.rpc("my_recent_tracks", { max_results: 20 });
  if (error) throw error;
  if (!recent?.length) return [];
  const { data: tracks, error: tracksError } = await supabase
    .from("tracks")
    .select(
      "id, title, duration_ms, release:releases(id, slug, title, status, publish_at, artist:artists!releases_artist_id_fkey(slug, name))",
    )
    .in(
      "id",
      recent.map((r) => r.track_id),
    );
  if (tracksError) throw tracksError;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const now = Date.now();
  return recent.flatMap((r) => {
    const track = byId.get(r.track_id);
    const release = track?.release;
    return track &&
      release?.artist &&
      release.status === "published" &&
      release.publish_at &&
      Date.parse(release.publish_at) <= now
      ? [
          {
            ...track,
            release: { ...release, artist: release.artist },
            lastPlayedAt: r.last_played_at,
            plays: r.plays,
          },
        ]
      : [];
  });
}
