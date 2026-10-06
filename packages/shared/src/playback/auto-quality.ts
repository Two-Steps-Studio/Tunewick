/**
 * Tier selection at track start (docs/audio.md §4.1).
 *
 * Auto picks the highest tier allowed by every limit; a fixed setting asks for that tier
 * regardless of network heuristics. Mid-track the player only ever steps down, after a stall —
 * never up. Every limit that kept the listener from a better available tier is returned as a
 * reason, so the quality indicator can say why (e.g. "Lossless with Premium") without guessing.
 */

import type { QualityTier } from "../quality";
import { TIER_ORDER, tierRank } from "./tiers";

export type QualitySetting = "auto" | QualityTier;
export type TierReason = "plan" | "setting" | "save_data" | "battery" | "network" | "throughput";

export interface NetworkInfo {
  /** `navigator.connection.saveData` */
  saveData?: boolean;
  /** `navigator.connection.effectiveType` */
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  /** Throughput measured from recent segment downloads, kbit/s. */
  measuredKbps?: number | null;
}

export interface AvailableVariant {
  tier: QualityTier;
  /** Real average bitrate of this track's variant (bytes × 8 / duration), kbit/s. */
  bitrateKbps: number;
}

export interface TierInput {
  setting: QualitySetting;
  /** Highest tier the listener's plan includes (Free: high, Premium: hires). */
  entitlement: QualityTier;
  /** Variants of this track that play on this device (see playableTiers). */
  available: readonly AvailableVariant[];
  network: NetworkInfo;
  batterySaver?: boolean;
}

export interface TierDecision {
  tier: QualityTier;
  reasons: TierReason[];
}

/** Download must be this much faster than playback to pick a tier on throughput. */
export const THROUGHPUT_MARGIN = 1.5;

interface Limit {
  reason: TierReason;
  tier: QualityTier;
}

function throughputLimit(
  available: readonly AvailableVariant[],
  measuredKbps: number,
): QualityTier | null {
  const sustainable = available
    .filter((variant) => variant.bitrateKbps * THROUGHPUT_MARGIN <= measuredKbps)
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
  return sustainable[0]?.tier ?? null;
}

function limitsFor(input: TierInput): Limit[] {
  const limits: Limit[] = [{ reason: "plan", tier: input.entitlement }];
  if (input.setting !== "auto") {
    limits.push({ reason: "setting", tier: input.setting });
    return limits;
  }
  const { network } = input;
  if (network.saveData) limits.push({ reason: "save_data", tier: "data_saver" });
  if (input.batterySaver) limits.push({ reason: "battery", tier: "high" });
  if (network.effectiveType === "slow-2g" || network.effectiveType === "2g") {
    limits.push({ reason: "network", tier: "data_saver" });
  } else if (network.effectiveType === "3g") {
    limits.push({ reason: "network", tier: "high" });
  }
  if (network.measuredKbps != null) {
    const tier = throughputLimit(input.available, network.measuredKbps) ?? "data_saver";
    limits.push({ reason: "throughput", tier });
  }
  return limits;
}

export function chooseTier(input: TierInput): TierDecision | null {
  const available = TIER_ORDER.filter((tier) => input.available.some((v) => v.tier === tier));
  if (available.length === 0) return null;

  const limits = limitsFor(input);
  const cap = Math.min(...limits.map((limit) => tierRank(limit.tier)));
  const allowed = available.filter((tier) => tierRank(tier) <= cap);
  const tier = allowed.at(-1) ?? available[0]!; // nothing fits the cap → the lightest variant

  const best = tierRank(available.at(-1)!);
  const reasons = [
    ...new Set(limits.filter((limit) => tierRank(limit.tier) < best).map((l) => l.reason)),
  ];
  return { tier, reasons };
}

/** After a stall: the next lower available tier, or null when already at the lowest. */
export function tierAfterStall(
  current: QualityTier,
  available: readonly AvailableVariant[],
): QualityTier | null {
  const lower = TIER_ORDER.filter(
    (tier) => tierRank(tier) < tierRank(current) && available.some((v) => v.tier === tier),
  );
  return lower.at(-1) ?? null;
}
