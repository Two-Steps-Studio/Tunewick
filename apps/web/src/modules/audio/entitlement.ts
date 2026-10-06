import "server-only";

import type { QualityTier } from "@tunewick/shared";

/**
 * Highest quality tier a listener may stream (docs/product.md: Free = High, Premium = Lossless
 * and Hi-Res). Premium (via codes, no card payments in the MVP) does not exist yet, so every
 * listener is on Free. Artists previewing their own releases and moderators are not limited.
 */
export async function listenerEntitlement(): Promise<QualityTier> {
  return "high";
}
