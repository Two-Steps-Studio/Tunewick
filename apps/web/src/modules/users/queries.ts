import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getImageSources } from "@/modules/images";

/** The signed-in user's profile and private settings (RLS: own rows only). */
export async function getMyAccount(userId: string) {
  const supabase = await createSupabaseServerClient();
  const [profile, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("handle, display_name, bio, image_id")
      .eq("id", userId)
      .single(),
    supabase
      .from("profile_settings")
      .select(
        "locale, activity_visibility, profile_public, stats_visibility, score_visibility, badges_visibility, replay_visibility",
      )
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
    .select("id, handle, display_name, bio, created_at, image_id")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Artist profiles that would be left without an owner if the account were deleted. */
export async function getDeletionBlockers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_deletion_blockers");
  if (error) throw error;
  return data ?? [];
}

/** Name and picture of the signed-in person for the top bar, once per request. */
export const getMyBadge = cache(async (userId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("handle, display_name, image_id")
    .eq("id", userId)
    .maybeSingle();
  const name = data?.display_name || (data?.handle ? `@${data.handle}` : null);
  return { name, image: await getImageSources(data?.image_id ?? null, 96) };
});
