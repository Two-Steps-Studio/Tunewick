import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Public artist page data; RLS hides suspended artists from non-members. */
export async function getArtistBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("artists")
    .select(
      "id, slug, name, bio, formed_year, verification_status, status, image_id, voivodeship, city, country_code, region, languages",
    )
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Memberships and pending invitations of the signed-in user. */
export async function getMyArtists(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("artist_members")
    .select("role, accepted_at, artist:artists (id, slug, name, verification_status)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data;
}

/**
 * Everything the manage page needs, or null when the user is not an accepted member.
 * Member profiles are fetched separately (artist_members references auth.users).
 */
export async function getArtistForManagement(slug: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const artist = await getArtistBySlug(slug);
  if (!artist) return null;

  const { data: members, error } = await supabase
    .from("artist_members")
    .select("user_id, role, accepted_at")
    .eq("artist_id", artist.id)
    .order("created_at");
  if (error) throw error;

  const me = members.find((m) => m.user_id === userId);
  if (!me?.accepted_at) return null;

  const [{ data: profiles }, { data: requests }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, handle, display_name")
      .in(
        "id",
        members.map((m) => m.user_id),
      ),
    supabase
      .from("artist_verification_requests")
      .select("status, created_at, decision_note")
      .eq("artist_id", artist.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  return {
    artist,
    myRole: me.role,
    members: members.map((m) => ({
      ...m,
      profile: profiles?.find((p) => p.id === m.user_id) ?? null,
    })),
    lastRequest: requests?.[0] ?? null,
  };
}

/** True when the signed-in user is an accepted member of the artist. */
export async function isArtistMember(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_artist_member", { artist: artistId });
  if (error) throw error;
  return data === true;
}

/** Genres (ids, names in both languages) and links of an artist — public data. */
export async function getArtistReach(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const [genres, links] = await Promise.all([
    supabase
      .from("artist_genres")
      .select("genre:genres(id, slug, name_pl, name_en)")
      .eq("artist_id", artistId),
    supabase.from("artist_links").select("kind, url").eq("artist_id", artistId).order("position"),
  ]);
  if (genres.error) throw genres.error;
  if (links.error) throw links.error;
  return {
    genres: genres.data.flatMap((row) => (row.genre ? [row.genre] : [])),
    links: links.data,
  };
}

/** Popular songs (real listener counts in the last 30 days, then newest), for the public page. */
export async function getArtistDiscovery(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("artist_top_tracks", {
    artist: artistId,
    max_results: 5,
  });
  if (error) throw error;
  return { topTracks: data ?? [] };
}

export type RelatedRelation =
  | "collaborated"
  | "shared_credit"
  | "same_label"
  | "shared_audience"
  | "same_city"
  | "played_together";

/** Related artists with the evidence for their strongest reason (public data only). */
export async function getRelatedArtists(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("related_artists", {
    artist: artistId,
    max_results: 8,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.artist_id,
    slug: row.slug,
    name: row.name,
    imageId: row.image_id,
    relation: row.relation as RelatedRelation,
    evidence: (row.evidence ?? {}) as Record<string, string | number>,
  }));
}

export interface ArtistDiscoveryStats {
  listeners_7d: number | null;
  listeners_prev_7d: number | null;
  listeners_30d: number | null;
  new_listeners_7d: number | null;
  discovered_30d: number | null;
  score_30d: number | null;
  rising_place: number | null;
  places: {
    countries: { code: string; listeners: number }[];
    cities: { city: string; country: string | null; listeners: number }[];
  };
}

/** An artist's discovery numbers (aggregates; counts under 3 listeners are null). */
export async function getArtistDiscoveryStats(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("artist_discovery", { artist: artistId });
  if (error) throw error;
  return (data as unknown as ArtistDiscoveryStats | null) ?? null;
}

export interface WhyArtist {
  listened: boolean;
  genres: { slug: string; name_pl: string; name_en: string }[];
  related: { slug: string; name: string }[];
  friends: { handle: string; name: string }[];
}

/** Why the signed-in listener might like this artist (their own listening; null signed out). */
export async function getWhyArtistForMe(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const { data, error } = await supabase.rpc("why_artist_for_me", { artist: artistId });
  if (error) throw error;
  return (data as unknown as WhyArtist | null) ?? null;
}

/** The team's weekly series for the last 12 weeks (members only). */
export async function getArtistDiscoveryWeeks(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("artist_discovery_weeks", { artist: artistId });
  if (error) throw error;
  return data ?? [];
}
