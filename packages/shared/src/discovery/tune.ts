import { TUNING, type FeatureWeights } from "./config";
import type { ReasonCode } from "./rank";

/** What the listener did with songs recommended for one reason (my_feed_outcomes, 60 days). */
export interface ReasonOutcome {
  reason: string;
  /** Distinct songs shown. */
  shown: number;
  /** Distinct songs liked, saved, or whose artist was followed. */
  hits: number;
  /** Distinct songs whose preview was heard to the end. */
  completes: number;
  skips: number;
}

/**
 * The features a reason stands for: the reason is the strongest signal behind an item, so how
 * well a reason works says how much that signal should count for this listener. Exploration
 * reasons are absent on purpose — the share of experiments is the listener's own setting.
 */
const REASON_FEATURES: Partial<Record<ReasonCode, readonly (keyof FeatureWeights)[]>> = {
  followed_artist: ["artist"],
  artist_you_like: ["artist"],
  genre_you_like: ["genre"],
  listeners_like_you: ["user"],
  loved_by_listeners: ["completion", "save"],
  near_you: ["regional"],
  popular: ["popularity"],
  rising: ["rising"],
  new_release: ["freshness"],
};

export interface Tuning {
  weights: FeatureWeights;
  /** Multipliers applied (only features that changed), for explanation and tests. */
  factors: Partial<Record<keyof FeatureWeights, number>>;
}

const success = (o: Pick<ReasonOutcome, "hits" | "completes">) =>
  o.hits + TUNING.completeWeight * o.completes;

/**
 * Per-listener weights: each reason's success rate (likes, saves, follows, finished previews per
 * song shown) compared with the listener's overall rate, shrunk toward it while there is little
 * evidence (`prior` songs of pseudo-data), square-rooted and clamped — a nudge, never a takeover.
 * Without enough history the weights come back unchanged.
 */
export function tuneWeights(base: FeatureWeights, outcomes: readonly ReasonOutcome[]): Tuning {
  const counted = outcomes.filter((o) => o.shown > 0);
  const shownTotal = counted.reduce((sum, o) => sum + o.shown, 0);
  const overall = shownTotal ? counted.reduce((sum, o) => sum + success(o), 0) / shownTotal : 0;
  if (shownTotal < TUNING.minShown || overall <= 0) return { weights: base, factors: {} };

  const perFeature = new Map<keyof FeatureWeights, { shown: number; success: number }>();
  for (const outcome of counted) {
    for (const feature of REASON_FEATURES[outcome.reason as ReasonCode] ?? []) {
      const acc = perFeature.get(feature) ?? { shown: 0, success: 0 };
      acc.shown += outcome.shown;
      acc.success += success(outcome);
      perFeature.set(feature, acc);
    }
  }

  const weights = { ...base };
  const factors: Tuning["factors"] = {};
  for (const [feature, { shown, success: s }] of perFeature) {
    const rate = (s + TUNING.prior * overall) / (shown + TUNING.prior);
    const factor = Math.min(
      TUNING.maxFactor,
      Math.max(TUNING.minFactor, Math.sqrt(rate / overall)),
    );
    const rounded = Math.round(factor * 100) / 100;
    if (rounded === 1) continue;
    weights[feature] = base[feature] * rounded;
    factors[feature] = rounded;
  }
  return { weights, factors };
}
