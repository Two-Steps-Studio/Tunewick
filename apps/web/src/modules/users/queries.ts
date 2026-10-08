import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The signed-in user's profile and private settings (RLS: own rows only). */
export async function getMyAccount(userId: string) {
  const supabase = await createSupabaseServerClient();
  const [profile, settings] = await Promise.all([
    supabase.from("profiles").select("handle, display_name, bio").eq("id", userId).single(),
    supabase
      .from("profile_settings")
      .select("locale, activity_visibility")
      .eq("user_id", userId)
      .single(),
  ]);
  if (profile.error) throw profile.error;
  if (settings.error) throw settings.error;
  return { profile: profile.data, settings: settings.data };
}

/** Public profile fields by handle; null when no active profile uses it. */
export async function getPublicProfile(handle: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name, bio, created_at")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Follower counts (public) and whether the signed-in user follows this person (null: visitor/self). */
export async function getUserFollow(personId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims?.sub ?? null;
  const [counts, mine] = await Promise.all([
    supabase.rpc("user_follow_counts", { person: personId }),
    me && me !== personId
      ? supabase
          .from("user_follows")
          .select("followee_id")
          .eq("followee_id", personId)
          .eq("follower_id", me)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (counts.error) throw counts.error;
  return {
    followers: counts.data?.[0]?.followers ?? 0,
    following: counts.data?.[0]?.following ?? 0,
    iFollow: me && me !== personId ? mine.data !== null : null,
    isMe: me === personId,
  };
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
