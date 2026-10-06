import "server-only";

import type { QualityTier } from "@tunewick/shared";
import { getMyPlan } from "@/modules/plans";

/**
 * Highest quality tier a listener may stream: the plan's `max_quality_tier` from the database
 * (docs/product.md: Free = High, Premium = Lossless and Hi-Res). Never decided by the client.
 */
export async function listenerEntitlement(): Promise<QualityTier> {
  return (await getMyPlan()).maxTier;
}
