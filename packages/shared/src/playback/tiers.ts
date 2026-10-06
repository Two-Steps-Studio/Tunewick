import type { QualityTier } from "../quality";

/** Lowest to highest. */
export const TIER_ORDER: readonly QualityTier[] = ["data_saver", "high", "lossless", "hires"];

export function tierRank(tier: QualityTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function lowerTier(a: QualityTier, b: QualityTier): QualityTier {
  return tierRank(a) <= tierRank(b) ? a : b;
}

/** The next tier down, or null below Data Saver. */
export function tierBelow(tier: QualityTier): QualityTier | null {
  return TIER_ORDER[tierRank(tier) - 1] ?? null;
}
