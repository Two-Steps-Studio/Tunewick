import "server-only";

import type { Database, QualityTier } from "@tunewick/shared";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EntitlementSource = Database["public"]["Enums"]["entitlement_source"];

export interface MyPlan {
  code: string;
  name: string;
  maxTier: QualityTier;
  /** null = for life (or Free, which does not end). */
  endsAt: string | null;
  source: EntitlementSource | null;
  sourceRef: string | null;
}

const FREE: MyPlan = {
  code: "free",
  name: "Free",
  maxTier: "high",
  endsAt: null,
  source: null,
  sourceRef: null,
};

/**
 * The caller's effective plan, straight from the database (docs/promotions.md §1). Cached per
 * request: the release page, the player limit and settings ask once.
 */
export const getMyPlan = cache(async (): Promise<MyPlan> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_plan").maybeSingle();
  if (error) throw error;
  if (!data) return FREE;
  return {
    code: data.plan_code,
    name: data.plan_name,
    maxTier: data.max_quality_tier,
    endsAt: data.ends_at,
    source: data.source,
    sourceRef: data.source_ref,
  };
});
