import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Known feature flags (rows in public.feature_flags). Unknown or missing flags are off. */
export type FeatureFlag = "closed_beta";

export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_feature_enabled", { flag });
  if (error) throw error;
  return data === true;
}
