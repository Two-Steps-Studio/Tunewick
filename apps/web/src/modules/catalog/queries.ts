import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Releases of an artist; RLS shows drafts only to members and staff. */
export async function getArtistReleases(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .select("id, slug, title, type, status, release_date")
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Everything the editor needs, or null when the release does not exist or the user is not a
 * member of its artist (the page then answers 404).
 */
export async function getReleaseForEditing(artistSlug: string, releaseSlug: string) {
  const supabase = await createSupabaseServerClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("id, slug, name")
    .eq("slug", artistSlug.toLowerCase())
    .maybeSingle();
  if (!artist) return null;

  const { data: member } = await supabase.rpc("is_artist_member", { artist: artist.id });
  if (!member) return null;

  const { data: release } = await supabase
    .from("releases")
    .select(
      "id, slug, title, type, status, release_date, explicit, ai_content, territories, upc, p_line, c_line",
    )
    .eq("artist_id", artist.id)
    .eq("slug", releaseSlug.toLowerCase())
    .maybeSingle();
  if (!release) return null;

  const [tracks, genres, allGenres] = await Promise.all([
    supabase
      .from("tracks")
      .select(
        "id, disc_number, track_number, title, isrc, explicit, ai_content, credits (id, name, role, detail)",
      )
      .eq("release_id", release.id)
      .order("disc_number")
      .order("track_number"),
    supabase.from("release_genres").select("genre_id").eq("release_id", release.id),
    supabase.from("genres").select("id, slug, name_pl, name_en").order("id"),
  ]);
  if (tracks.error) throw tracks.error;

  return {
    artist,
    release,
    editable: release.status === "draft" || release.status === "rejected",
    tracks: tracks.data,
    genreIds: (genres.data ?? []).map((g) => g.genre_id),
    allGenres: allGenres.data ?? [],
  };
}

/** Releases visible to everyone (same rule as release_is_public), regardless of who asks. */
export async function getPublishedReleases(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .select("id, slug, title, type, release_date")
    .eq("artist_id", artistId)
    .eq("status", "published")
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** The current (latest) rights declaration of a release; earlier ones stay as history. */
export async function getLatestDeclaration(releaseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rights_declarations")
    .select(
      "id, owns_master, controls_composition, cmo_memberships, samples, samples_description, ai_content, territories, terms_version, declared_at",
    )
    .eq("release_id", releaseId)
    .order("declared_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
