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
  status?: "added" | "failed";
  playlist?: string;
}

/** Appends a track to one of the listener's playlists (the database checks owner and track). */
export async function addToPlaylist(
  trackId: string,
  _prev: AddState,
  formData: FormData,
): Promise<AddState> {
  const playlist = String(formData.get("playlist") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_playlist_track", { playlist, track: trackId });
  if (error) return { status: "failed", playlist };
  return { status: "added", playlist };
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
