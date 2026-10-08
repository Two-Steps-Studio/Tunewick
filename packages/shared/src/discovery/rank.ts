/**
 * Feed ranking (docs/discovery-expansion.md §4): a transparent weighted score per candidate, a
 * personalization/exploration mix and diversity rules. Pure and seeded — the same inputs give the
 * same feed, so it is testable; swap this module for a learned model behind the same types.
 */

import {
  EXPLORING_MODES,
  FEED,
  MODE_WEIGHTS,
  type DiscoveryMode,
  type FeatureWeights,
} from "./config";

/** One playable track with the aggregate signals the database computed for it. */
export interface Candidate {
  trackId: string;
  artistId: string;
  genreIds: readonly number[];
  countryCode: string | null;
  macroRegion: string | null;
  languages: readonly string[];
  publishAt: string;
  listeners30d: number;
  listeners7d: number;
  listenersPrev7d: number;
  plays30d: number;
  completionRate: number;
  replayRate: number;
  saveRate: number;
  skipRate: number;
  countryListeners30d: number;
}

/** What is known about the listener (empty for a new or anonymous listener). */
export interface Taste {
  genres: ReadonlyMap<number, number>;
  artists: ReadonlyMap<string, number>;
  countries: ReadonlyMap<string, number>;
  /** Artists of listeners with a similar ear (shared follows and shared listening), by people. */
  coFollowed: ReadonlyMap<string, number>;
  followed: ReadonlySet<string>;
  heard: ReadonlySet<string>;
  recentlyShown: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  country: string | null;
  macroRegion: string | null;
  languages: readonly string[];
}

export const EMPTY_TASTE: Taste = {
  genres: new Map(),
  artists: new Map(),
  countries: new Map(),
  coFollowed: new Map(),
  followed: new Set(),
  heard: new Set(),
  recentlyShown: new Set(),
  skipped: new Set(),
  country: null,
  macroRegion: null,
  languages: [],
};

export type ReasonCode =
  | "followed_artist"
  | "artist_you_like"
  | "genre_you_like"
  | "listeners_like_you"
  | "loved_by_listeners"
  | "near_you"
  | "popular"
  | "rising"
  | "new_release"
  | "new_genre"
  | "new_country"
  | "wildcard"
  /** Pinned by the request: a shared link, or "Discover this artist". */
  | "shared"
  | "artist_spotlight"
  /** From the listener's Daily Discovery / Weekly Drop, or "Similar to" a song. */
  | "daily_discovery"
  | "weekly_drop"
  | "similar_to";

export interface Reason {
  code: ReasonCode;
  genreId?: number;
  countryCode?: string;
  /** The song a "similar to" item is like; the Weekly Drop section of a set item. */
  title?: string;
  section?: string;
}

export interface RankedItem {
  trackId: string;
  score: number;
  exploration: boolean;
  reason: Reason;
}

export interface RankOptions {
  mode: DiscoveryMode;
  size: number;
  /** Tracks already in the listener's feed this session (never repeated). */
  exclude?: ReadonlySet<string>;
  explorationShare?: number;
  /** Seed for jitter and exploration slots. */
  seed: number;
  now?: number;
  weights?: FeatureWeights;
  /** Random jitter (default FEED.jitter); Surprise Me raises it. */
  jitter?: number;
  /** Only candidates passing this test (journeys, sets). */
  filter?: (candidate: Candidate) => boolean;
}

export type Features = Record<keyof FeatureWeights, number>;

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function maxAbs(values: Iterable<number>) {
  let max = 0;
  for (const value of values) max = Math.max(max, Math.abs(value));
  return max;
}

/** A rate seen over few plays is pulled towards a neutral prior (no lucky 100 % from 1 play). */
function shrunk(rate: number, n: number, prior: number, strength = 5) {
  return (rate * n + prior * strength) / (n + strength);
}

interface Context {
  maxGenre: number;
  maxArtist: number;
  maxCoFollow: number;
  maxListeners: number;
  now: number;
}

function context(candidates: readonly Candidate[], taste: Taste, now: number): Context {
  return {
    maxGenre: maxAbs(taste.genres.values()) || 1,
    maxArtist: maxAbs(taste.artists.values()) || 1,
    maxCoFollow: maxAbs(taste.coFollowed.values()) || 1,
    maxListeners: Math.max(1, ...candidates.map((c) => c.listeners30d)),
    now,
  };
}

/** Best (and, for reasons, which) genre affinity of a candidate, -1..1. */
function genreAffinity(candidate: Candidate, taste: Taste, ctx: Context) {
  let best = 0;
  let genreId: number | undefined;
  for (const id of candidate.genreIds) {
    const value = (taste.genres.get(id) ?? 0) / ctx.maxGenre;
    if (genreId === undefined || value > best) {
      best = value;
      genreId = id;
    }
  }
  return { value: clamp(best, -1, 1), genreId };
}

export function features(candidate: Candidate, taste: Taste, ctx: Context): Features {
  const ageDays = Math.max(0, (ctx.now - Date.parse(candidate.publishAt)) / 86_400_000);
  const artist = taste.followed.has(candidate.artistId)
    ? 1
    : clamp((taste.artists.get(candidate.artistId) ?? 0) / ctx.maxArtist, -1, 1);
  const sameCountry = taste.country !== null && candidate.countryCode === taste.country;
  const sameRegion = taste.macroRegion !== null && candidate.macroRegion === taste.macroRegion;
  const localShare =
    candidate.listeners30d > 0 ? candidate.countryListeners30d / candidate.listeners30d : 0;
  const growth =
    (candidate.listeners7d - candidate.listenersPrev7d) / (candidate.listenersPrev7d + 3);
  const seen = taste.heard.has(candidate.trackId)
    ? 1
    : taste.recentlyShown.has(candidate.trackId)
      ? 0.5
      : 0;
  return {
    genre: genreAffinity(candidate, taste, ctx).value,
    artist,
    user: clamp((taste.coFollowed.get(candidate.artistId) ?? 0) / ctx.maxCoFollow, 0, 1),
    completion: shrunk(candidate.completionRate, candidate.plays30d, 0.5),
    replay: shrunk(candidate.replayRate, candidate.plays30d, 0.1),
    save: shrunk(candidate.saveRate, candidate.listeners30d, 0.05),
    freshness: Math.exp(-ageDays / FEED.freshnessDays),
    popularity: Math.log1p(candidate.listeners30d) / Math.log1p(ctx.maxListeners),
    regional: sameCountry ? 0.8 + 0.2 * localShare : sameRegion ? 0.3 : 0.2 * localShare,
    language:
      taste.languages.length && candidate.languages.some((l) => taste.languages.includes(l))
        ? 1
        : 0,
    rising: clamp(growth, 0, 1),
    skip: Math.max(
      shrunk(candidate.skipRate, candidate.plays30d, 0.2),
      taste.skipped.has(candidate.trackId) ? 1 : 0,
    ),
    seen,
  };
}

export function scoreOf(f: Features, w: FeatureWeights) {
  return (
    w.genre * f.genre +
    w.artist * f.artist +
    w.user * f.user +
    w.completion * f.completion +
    w.replay * f.replay +
    w.save * f.save +
    w.freshness * f.freshness +
    w.popularity * f.popularity +
    w.regional * f.regional +
    w.language * f.language +
    w.rising * f.rising -
    w.skip * f.skip -
    w.seen * f.seen
  );
}

/** Is this an experiment for the listener: a genre and a country they have no affinity with? */
function isExploration(candidate: Candidate, taste: Taste) {
  const knownGenre = candidate.genreIds.some((id) => (taste.genres.get(id) ?? 0) > 0);
  const knownCountry =
    candidate.countryCode !== null && (taste.countries.get(candidate.countryCode) ?? 0) > 0;
  return !taste.artists.has(candidate.artistId) && !knownGenre && !knownCountry;
}

/** The true, strongest reason this item is here. */
function reasonFor(
  candidate: Candidate,
  f: Features,
  w: FeatureWeights,
  taste: Taste,
  ctx: Context,
  exploration: boolean,
): Reason {
  if (exploration) {
    const newGenre = candidate.genreIds.find((id) => !taste.genres.has(id));
    if (newGenre !== undefined && taste.genres.size)
      return { code: "new_genre", genreId: newGenre };
    if (
      candidate.countryCode &&
      taste.countries.size &&
      !taste.countries.has(candidate.countryCode)
    )
      return { code: "new_country", countryCode: candidate.countryCode };
    return { code: "wildcard" };
  }
  const options: [number, Reason][] = [
    [
      w.artist * f.artist,
      taste.followed.has(candidate.artistId)
        ? { code: "followed_artist" }
        : { code: "artist_you_like" },
    ],
    [
      w.genre * f.genre,
      { code: "genre_you_like", genreId: genreAffinity(candidate, taste, ctx).genreId },
    ],
    [w.user * f.user, { code: "listeners_like_you" }],
    [w.completion * (f.completion - 0.5) + w.save * f.save, { code: "loved_by_listeners" }],
    [
      w.regional * f.regional,
      candidate.countryCode
        ? { code: "near_you", countryCode: candidate.countryCode }
        : { code: "popular" },
    ],
    [w.popularity * f.popularity, { code: "popular" }],
    [w.rising * f.rising, { code: "rising" }],
    [w.freshness * f.freshness, { code: "new_release" }],
  ];
  const [value, reason] = options.reduce((best, option) => (option[0] > best[0] ? option : best));
  return value > 0 ? reason : { code: "wildcard" };
}

interface Scored {
  candidate: Candidate;
  features: Features;
  score: number;
  exploreScore: number;
  exploration: boolean;
}

/**
 * Picks `size` items: each slot is an exploration slot with probability `explorationShare`
 * (exploring modes only), filled with the best remaining candidate of that pool that keeps the
 * page diverse (artist spacing, genre share). Constraints relax only when nothing else is left.
 */
export function rankFeed(
  candidates: readonly Candidate[],
  taste: Taste,
  options: RankOptions,
): RankedItem[] {
  const random = seededRandom(options.seed);
  const weights = options.weights ?? MODE_WEIGHTS[options.mode];
  const ctx = context(candidates, taste, options.now ?? Date.now());
  const share = EXPLORING_MODES.includes(options.mode)
    ? clamp(options.explorationShare ?? FEED.explorationShare, 0, 0.5)
    : 0;

  const jitterSize = options.jitter ?? FEED.jitter;
  const pool: Scored[] = candidates
    .filter((c) => !options.exclude?.has(c.trackId) && (options.filter?.(c) ?? true))
    .map((candidate) => {
      const f = features(candidate, taste, ctx);
      const exploration = share > 0 && isExploration(candidate, taste);
      const jitter = (random() - 0.5) * jitterSize;
      const score = scoreOf(f, weights) + jitter;
      // Experiments favour the unknown and the undiscovered (low popularity), but still music
      // listeners finish and keep.
      const exploreScore =
        0.6 * (1 - f.popularity) +
        0.6 * f.completion +
        0.4 * f.save +
        0.3 * f.freshness -
        weights.skip * f.skip -
        weights.seen * f.seen +
        jitter;
      return { candidate, features: f, score, exploreScore, exploration };
    });

  const picked: Scored[] = [];
  const used = new Set<string>();
  const genreCount = new Map<number, number>();
  const genreLimit = Math.max(1, Math.floor(FEED.maxGenreShare * options.size));

  /** 2 = artist spacing and genre share, 1 = artist spacing only, 0 = anything unused. */
  type Level = 0 | 1 | 2;
  const fits = (item: Scored, level: Level) => {
    if (used.has(item.candidate.trackId)) return false;
    if (level === 0) return true;
    const recent = picked.slice(-(FEED.artistSpacing - 1));
    if (recent.some((p) => p.candidate.artistId === item.candidate.artistId)) return false;
    if (level === 1) return true;
    const genre = item.candidate.genreIds[0];
    return genre === undefined || (genreCount.get(genre) ?? 0) < genreLimit;
  };

  const best = (items: Scored[], key: "score" | "exploreScore", level: Level) => {
    let winner: Scored | null = null;
    for (const item of items) {
      if (fits(item, level) && (!winner || item[key] > winner[key])) winner = item;
    }
    return winner;
  };

  const explorationPool = pool.filter((item) => item.exploration);
  while (picked.length < Math.min(options.size, pool.length)) {
    const explore = share > 0 && random() < share;
    // Diversity first: relax the rules (genre share, then artist spacing) only when no
    // candidate keeps them.
    const choice =
      (explore ? best(explorationPool, "exploreScore", 2) : null) ??
      best(pool, "score", 2) ??
      (explore ? best(explorationPool, "exploreScore", 1) : null) ??
      best(pool, "score", 1) ??
      best(pool, "score", 0);
    if (!choice) break;
    const asExploration = explore && choice.exploration;
    picked.push(asExploration ? choice : { ...choice, exploration: false });
    used.add(choice.candidate.trackId);
    const genre = choice.candidate.genreIds[0];
    if (genre !== undefined) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }

  return picked.map((item) => ({
    trackId: item.candidate.trackId,
    score: Math.round((item.exploration ? item.exploreScore : item.score) * 1000) / 1000,
    exploration: item.exploration,
    reason: reasonFor(item.candidate, item.features, weights, taste, ctx, item.exploration),
  }));
}
