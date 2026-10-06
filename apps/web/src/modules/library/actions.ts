"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LibraryKind = "track" | "release" | "artist";

async function write(kind: LibraryKind, id: string, on: boolean) {
  const supabase = await createSupabaseServerClient();
  switch (kind) {
    case "track":
      return on
        ? supabase.from("track_likes").insert({ track_id: id })
        : supabase.from("track_likes").delete().eq("track_id", id);
    case "release":
      return on
        ? supabase.from("release_likes").insert({ release_id: id })
        : supabase.from("release_likes").delete().eq("release_id", id);
    case "artist":
      return on
        ? supabase.from("artist_follows").insert({ artist_id: id })
        : supabase.from("artist_follows").delete().eq("artist_id", id);
  }
}

/**
 * Sets a like/follow to `on` (idempotent: liking twice or unliking something not liked is fine).
 * Returns the state the database now has, so the button never shows a guess.
 */
export async function setLibraryItem(kind: LibraryKind, id: string, on: boolean) {
  const { error } = await write(kind, id, on);
  // Already liked (another tab, a double click) is the state we wanted.
  if (error && error.code !== "23505") return { ok: false as const, on: !on };
  if (kind === "artist") refresh();
  return { ok: true as const, on };
}

/** Deletes the listener's whole listening history (RLS: own rows only). */
export async function clearListeningHistory() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("listening_events")
    .delete()
    .gte("started_at", "1970-01-01T00:00:00Z");
  if (error) throw error;
  refresh();
}
