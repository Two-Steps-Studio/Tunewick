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
    .select("handle, display_name, bio, created_at")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}
