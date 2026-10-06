import "server-only";

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
  return data.map((p) => ({
    id: p.id,
    title: p.title,
    visibility: p.visibility,
    updatedAt: p.updated_at,
    count: p.items[0]?.count ?? 0,
  }));
}

/**
 * A playlist the caller may see (owner, or public/unlisted), with its items in order. Items
 * whose music is no longer public are hidden by RLS and reported as `hidden` (a count only).
 */
export async function getPlaylist(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: playlist, error } = await supabase
    .from("playlists")
    .select("id, owner_id, title, description, visibility, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!playlist) return null;

  const [items, owner] = await Promise.all([
    supabase
      .from("playlist_tracks")
      .select(
        "id, position, added_at, track:tracks(id, title, duration_ms, release:releases(id, slug, title, status, publish_at, artist:artists!releases_artist_id_fkey(slug, name)))",
      )
      .eq("playlist_id", id)
      .order("position")
      .order("added_at"),
    supabase
      .from("profiles")
      .select("handle, display_name")
      .eq("id", playlist.owner_id)
      .maybeSingle(),
  ]);
  if (items.error) throw items.error;

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
  return {
    playlist,
    owner: owner.data ?? null,
    items: visible,
    hidden: items.data.length - visible.length,
  };
}
