import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Releases waiting for review, oldest first (RLS: staff see every release). */
export async function getSubmissions() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .select(
      "id, title, type, submitted_at, artist:artists!releases_artist_id_fkey (slug, name, verification_status), tracks (count)",
    )
    .eq("status", "in_review")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** One submission with everything the moderator needs to decide. */
export async function getSubmission(releaseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: release } = await supabase
    .from("releases")
    .select(
      "id, slug, title, type, status, release_date, submitted_at, explicit, ai_content, territories, upc, p_line, c_line, artwork_image_id, artist:artists!releases_artist_id_fkey (id, slug, name, verification_status)",
    )
    .eq("id", releaseId)
    .maybeSingle();
  if (!release || !release.artist) return null;
  const [{ data: tracks }, { data: history }] = await Promise.all([
    supabase
      .from("tracks")
      .select(
        "id, disc_number, track_number, title, isrc, explicit, ai_content, credits (name, role, detail)",
      )
      .eq("release_id", releaseId)
      .order("disc_number")
      .order("track_number"),
    supabase
      .from("release_review_events")
      .select("kind, note, created_at")
      .eq("release_id", releaseId)
      .order("created_at"),
  ]);
  return { release, artist: release.artist, tracks: tracks ?? [], history: history ?? [] };
}
