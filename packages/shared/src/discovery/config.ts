/**
 * Discovery configuration (docs/discovery-expansion.md §4–§5). Every number that shapes the feed
 * or the progress system lives here, so tuning is one reviewed change — and a learned model can
 * later replace `rankFeed` without touching callers.
 */

export const DISCOVERY_MODES = ["for_you", "global", "nearby", "new", "rising"] as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[number];

export function isDiscoveryMode(value: unknown): value is DiscoveryMode {
  return typeof value === "string" && (DISCOVERY_MODES as readonly string[]).includes(value);
}

/** Feature weights. Every feature is normalized to 0..1 (affinities to -1..1) before weighting. */
export interface FeatureWeights {
  genre: number;
  artist: number;
  /** Listeners with similar follows (collaborative signal). */
  user: number;
  completion: number;
  replay: number;
  save: number;
  freshness: number;
  popularity: number;
  regional: number;
  language: number;
  rising: number;
  /** Subtracted. */
  skip: number;
  /** Subtracted: already discovered or shown in the last days. */
  seen: number;
}

const BASE: FeatureWeights = {
  genre: 3,
  artist: 1.5,
  user: 1.5,
  completion: 1,
  replay: 0.5,
  save: 1,
  freshness: 1,
  popularity: 0.8,
  regional: 0.8,
  language: 0.5,
  rising: 0.5,
  skip: 2,
  seen: 4,
};

export const MODE_WEIGHTS: Record<DiscoveryMode, FeatureWeights> = {
  for_you: BASE,
  global: {
    ...BASE,
    genre: 0.8,
    artist: 0.3,
    user: 0.3,
    popularity: 2.5,
    regional: 0,
    completion: 1.2,
    save: 1.2,
  },
  nearby: { ...BASE, genre: 1.2, regional: 6, popularity: 0.8, freshness: 1.2 },
  new: { ...BASE, genre: 1.2, artist: 0.8, freshness: 4, popularity: 0.3 },
  rising: { ...BASE, genre: 1, rising: 4, popularity: 0.5, freshness: 0.8 },
};

/** Modes that mix in exploration slots (the others are explicit lenses the listener chose). */
export const EXPLORING_MODES: readonly DiscoveryMode[] = ["for_you", "global"];

export const FEED = {
  /** Share of slots for experiments (new genre/country, low popularity). Listener-adjustable. */
  explorationShare: 0.25,
  minExplorationShare: 0.1,
  maxExplorationShare: 0.4,
  /** No artist twice within this many consecutive items. */
  artistSpacing: 4,
  /** Max share of one primary genre in a page. */
  maxGenreShare: 0.4,
  /** Random jitter added to scores (controlled serendipity, also breaks ties). */
  jitter: 0.35,
  /** Freshness half-life-ish constant, days. */
  freshnessDays: 30,
  pageSize: 8,
} as const;

/** Preview defaults when the artist did not choose a soundcheck. */
export const PREVIEW = {
  lengthMs: 30_000,
  minLengthMs: 15_000,
  /** Fallback start: about a third in — past most intros, before most outros. */
  startFraction: 0.33,
  /** Heard at least this much (or the whole preview) = a discovery (mirrors the database). */
  discoveryMs: 15_000,
} as const;

/** Level thresholds (Discovery Score). Past the last named level, every `stepAfter` is a level. */
export const LEVELS = {
  thresholds: [0, 100, 400, 1_000, 2_500, 5_000, 10_000, 20_000] as const,
  titles: [
    "new_listener",
    "explorer",
    "music_hunter",
    "music_explorer",
    "discoverer",
    "trendsetter",
    "music_scout",
    "global_explorer",
  ] as const,
  stepAfter: 15_000,
} as const;

export type LevelTitle = (typeof LEVELS.titles)[number];

/** Adaptive goals: target = average × stretch + 1, clamped, rounded to a friendly number. */
export const GOALS = {
  stretch: 1.2,
  daily: {
    songs: { min: 5, max: 30, fallback: 10 },
    artists: { min: 3, max: 15, fallback: 5 },
  },
  weekly: {
    countries: { min: 3, max: 15, fallback: 5 },
    artists: { min: 10, max: 60, fallback: 25 },
  },
} as const;

/** Genres for which diversity reaches 1 when discoveries are spread evenly across them. */
export const DIVERSITY_REFERENCE_GENRES = 12;
