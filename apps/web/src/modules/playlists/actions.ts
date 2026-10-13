"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PlaylistFormState {
  error?: "title" | "limit" | "failed";
  values?: { title: string; description: string; visibility: string };
  saved?: boolean;
}

const VISIBILITIES = new Set(["public", "unlisted", "private"]);

function readForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    visibility: String(formData.get("visibility") ?? "private"),
  };
}

export async function createPlaylist(
  _prev: PlaylistFormState,
  formData: FormData,
): Promise<PlaylistFormState> {
  const values = readForm(formData);
  if (!values.title || values.title.length > 100) return { error: "title", values };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("playlists")
    .insert({ title: values.title })
    .select("id")
    .single();
  // The insert policy refuses the 201st playlist.
  if (error) return { error: error.code === "42501" ? "limit" : "failed", values };
  return redirect({
    href: { pathname: "/playlists/[id]", params: { id: data.id } },
    locale: await getLocale(),
  });
}

export async function updatePlaylist(
  id: string,
  _prev: PlaylistFormState,
  formData: FormData,
): Promise<PlaylistFormState> {
  const values = readForm(formData);
  if (!values.title || values.title.length > 100) return { error: "title", values };
  if (values.description.length > 500 || !VISIBILITIES.has(values.visibility)) {
    return { error: "failed", values };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("playlists")
    .update({
      title: values.title,
      description: values.description || null,
      visibility: values.visibility as "public" | "unlisted" | "private",
    })
    .eq("id", id);
  if (error) return { error: "failed", values };
  refresh();
  return { saved: true };
}

export async function deletePlaylist(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("playlists").delete().eq("id", id);
  if (error) throw error;
  redirect({ href: "/library", locale: await getLocale() });
}

export interface AddState {
  status?: "added" | "duplicate" | "failed" | "title" | "limit";
  playlist?: string;
  /** Title of the playlist the track went to (also for one created on the spot). */
  playlistTitle?: string;
}

/**
 * Appends a track to one of the listener's playlists (the database checks owner and track).
 * A track already on that playlist is not added twice unless the listener confirms (`again`).
 */
export async function addToPlaylist(
  trackId: string,
  _prev: AddState,
  formData: FormData,
): Promise<AddState> {
  const playlist = String(formData.get("playlist") ?? "");
  const again = formData.get("again") === "1";
  const supabase = await createSupabaseServerClient();
  if (!again) {
    const { count } = await supabase
      .from("playlist_tracks")
      .select("id", { count: "exact", head: true })
      .eq("playlist_id", playlist)
      .eq("track_id", trackId);
    if (count) return { status: "duplicate", playlist };
  }
  const { error } = await supabase.rpc("add_playlist_track", { playlist, track: trackId });
  if (error) return { status: "failed", playlist };
  return { status: "added", playlist };
}

/** "New playlist" right in the add menu: creates it and puts the track in, in one step. */
export async function createPlaylistWithTrack(
  trackId: string,
  _prev: AddState,
  formData: FormData,
): Promise<AddState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 100) return { status: "title" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("playlists").insert({ title }).select("id").single();
  if (error) return { status: error.code === "42501" ? "limit" : "failed" };
  const added = await supabase.rpc("add_playlist_track", { playlist: data.id, track: trackId });
  if (added.error) return { status: "failed", playlist: data.id, playlistTitle: title };
  refresh();
  return { status: "added", playlist: data.id, playlistTitle: title };
}

/** The listener's playlists for a picker opened outside a page render (the player bar). */
export async function listMyPlaylists(): Promise<{ id: string; title: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return [];
  const { data } = await supabase
    .from("playlists")
    .select("id, title")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function removePlaylistItem(itemId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("playlist_tracks").delete().eq("id", itemId);
  if (error) throw error;
  refresh();
}

export async function movePlaylistItem(itemId: string, toIndex: number) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("move_playlist_track", { item: itemId, to_index: toIndex });
  if (error) throw error;
  refresh();
}
