import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Follower counts and how the signed-in person relates to a profile (null: no such profile). */
export async function getRelationship(profileId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("profile_relationship", { profile: profileId });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** "Byłem przy tym" and public playlists — empty unless the owner's visibility allows it. */
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
