import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Campaigns, newest first (RLS: admins with MFA). */
export async function getCampaigns() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("promo_campaigns")
    .select(
      "id, name, partner, active, starts_at, ends_at, redemptions_count, max_redemptions_total, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

/** One campaign with its codes (hints only) and redemptions; null when it does not exist. */
export async function getCampaign(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("promo_campaigns")
    .select(
      "id, name, description, partner, active, starts_at, ends_at, redemptions_count, max_redemptions_total, per_user_limit",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [codes, redemptions] = await Promise.all([
    supabase.rpc("admin_list_promo_codes", { campaign: id }),
    supabase.rpc("admin_list_promo_redemptions", { campaign: id }),
  ]);
  if (codes.error) throw codes.error;
  if (redemptions.error) throw redemptions.error;
  return { campaign: data, codes: codes.data, redemptions: redemptions.data };
}
