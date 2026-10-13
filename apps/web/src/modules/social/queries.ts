import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Follower counts and how the signed-in person relates to a profile (null: no such profile). */
export async function getRelationship(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("profile_relationship", { profile: profileId });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** "Byłem przy tym" and public playlists - empty unless the owner's visibility allows it. */
export async function getProfileActivity(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const [events, playlists] = await Promise.all([
    supabase.rpc("profile_attended_events", { profile: profileId }),
    supabase.rpc("profile_playlists", { profile: profileId }),
  ]);
  if (events.error) throw events.error;
  if (playlists.error) throw playlists.error;
  return { events: events.data ?? [], playlists: playlists.data ?? [] };
}

/** People the signed-in person has blocked. */
export async function getMyBlockedUsers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_blocked_users");
  if (error) throw error;
  return data ?? [];
}

/** People the signed-in user follows (newest first), with their public names. */
export async function getMyFollowing() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return [];
  const { data, error } = await supabase
    .from("user_follows")
    .select("followee_id, created_at")
    .eq("follower_id", auth.claims.sub)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!data.length) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .in(
      "id",
      data.map((f) => f.followee_id),
    );
  return data.flatMap((f) => {
    const p = profiles?.find((x) => x.id === f.followee_id);
    return p?.handle
      ? [{ id: p.id, handle: p.handle, name: p.display_name ?? `@${p.handle}` }]
      : [];
  });
}

export interface DiscoverySummary {
  songs: number;
  artists: number;
  countries: number;
  listening_ms: number;
  new_artists: number;
  points: number;
}

/** You vs them (null when their visibility setting does not allow it). */
export async function compareWith(handle: string, days: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("compare_with", { handle, days });
  if (error) throw error;
  return data as unknown as { me: DiscoverySummary; them: DiscoverySummary } | null;
}

export type FriendsPeriod = "week" | "month" | "all";

/** You and the people you follow (whose score is visible to you), ranked by XP. */
export async function getFriendsLeaderboard(period: FriendsPeriod) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("friends_leaderboard", { period });
  if (error) throw error;
  return data ?? [];
}

/** New artists and badges of the people you follow (last 30 days, as far as they allow). */
export async function getFriendsActivity() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("friends_activity", { max_results: 40 });
  if (error) throw error;
  return data ?? [];
}

export interface CommonGround {
  artists: { slug: string; name: string }[];
  genres: { slug: string; name_pl: string; name_en: string }[];
  match: number;
}

/** Artists and genres you share with a person; null when their stats are not visible to you. */
export async function getCommonGround(handle: string): Promise<CommonGround | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("common_ground", { handle });
  if (error) throw error;
  return (data as unknown as CommonGround | null) ?? null;
}

export interface ProfileOverview {
  score: { xp: number; discovery_xp: number; genre_spread: number[] } | null;
  badges: { code: string; at: string }[] | null;
  stats: {
    listening_ms: number;
    active_days: number;
    new_artists: number;
    new_songs: number;
  } | null;
  replay: {
    year: number;
    minutes: number;
    new_artists: number;
    top_artist: { name: string; slug: string } | null;
  } | null;
}

/** A profile's score, badges and last 30 days - each part only if its owner lets you see it. */
export async function getProfileOverview(handle: string): Promise<ProfileOverview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("profile_overview", { handle });
  if (error) throw error;
  return (data as unknown as ProfileOverview | null) ?? null;
}
