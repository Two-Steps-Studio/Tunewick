import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlaylistVisibility = "public" | "unlisted" | "private";

/** The signed-in listener's playlists, recently changed first (RLS: own + public). */
export async function getMyPlaylists(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("playlists")
    .select("id, title, visibility, updated_at, items:playlist_tracks(count)")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const covers = await playlistCovers(data.map((p) => p.id));
  return data.map((p) => ({
    id: p.id,
    title: p.title,
    visibility: p.visibility,
    updatedAt: p.updated_at,
    count: p.items[0]?.count ?? 0,
    covers: covers.get(p.id) ?? [],
  }));
}

/**
 * Cover image ids per playlist: the first (up to) four different release covers, in playlist
 * order (public.playlist_covers; RLS decides what the caller may see). Empty map on failure -
 * covers are decoration, never a reason for a page to fail.
 */
export async function playlistCovers(ids: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!ids.length) return result;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("playlist_covers", { ids });
  if (error) return result;
  for (const row of data ?? []) result.set(row.playlist_id, row.artwork_ids ?? []);
  return result;
}

type OpenedPlaylist = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  visibility: PlaylistVisibility;
  updated_at: string;
  items: { id: string; position: number; added_at: string; track_id: string }[];
};

/** A playlist by id through public.open_playlist (own, public, or unlisted with the link). */
export const openPlaylist = cache(async (id: string): Promise<OpenedPlaylist | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_playlist", { playlist: id });
  if (error) throw error;
  return (data as OpenedPlaylist | null) ?? null;
});

/**
 * A playlist the caller may see (owner, or public/unlisted), with its items in order. Items
 * whose music is no longer public are hidden by RLS and reported as `hidden` (a count only).
 */
export const getPlaylist = cache(async (id: string) => {
  const opened = await openPlaylist(id);
  if (!opened) return null;
  const { items: rows, ...playlist } = opened;

  const supabase = await createSupabaseServerClient();
  const trackIds = [...new Set(rows.map((row) => row.track_id))];
  const [tracks, owner] = await Promise.all([
    trackIds.length
      ? supabase
          .from("tracks")
          .select(
            "id, title, duration_ms, release:releases(id, slug, title, status, publish_at, artwork_image_id, artist:artists!releases_artist_id_fkey(slug, name))",
          )
          .in("id", trackIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("profiles")
      .select("handle, display_name")
      .eq("id", playlist.owner_id)
      .maybeSingle(),
  ]);
  if (tracks.error) throw tracks.error;
  const byId = new Map((tracks.data ?? []).map((track) => [track.id, track]));
  const items = {
    data: rows.map((row) => ({ id: row.id, track: byId.get(row.track_id) ?? null })),
  };

  const now = Date.now();
  const visible = items.data.flatMap((item) => {
    const release = item.track?.release;
    return item.track &&
      release &&
      release.artist &&
      release.status === "published" &&
      release.publish_at &&
      Date.parse(release.publish_at) <= now
      ? [{ id: item.id, track: { ...item.track, release: { ...release, artist: release.artist } } }]
      : [];
  });
  // The mosaic: first four different covers, in playlist order.
  const covers: string[] = [];
  for (const item of visible) {
    const cover = item.track.release.artwork_image_id;
    if (cover && !covers.includes(cover)) covers.push(cover);
    if (covers.length === 4) break;
  }
  return {
    playlist,
    owner: owner.data ?? null,
    items: visible,
    hidden: items.data.length - visible.length,
    covers,
    durationMs: visible.reduce((sum, item) => sum + (item.track.duration_ms ?? 0), 0),
  };
});
