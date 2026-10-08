/**
 * Surprise Me journeys and the Daily Discovery / Weekly Drop picks (docs/discovery-v2.md M14.3).
 * Each journey is a lens on the same candidates and ranking as the feed: different weights,
 * exploration, randomness and a filter — never a separate catalogue.
 */

import { MODE_WEIGHTS, type DiscoveryMode, type FeatureWeights } from "./config";
import { rankFeed, type Candidate, type RankedItem, type Taste } from "./rank";

export const JOURNEYS = [
  "surprise",
  "something_new",
  "outside_taste",
  "underground",
  "global",
  "similar_to_me",
] as const;
export type Journey = (typeof JOURNEYS)[number];

export function isJourney(value: unknown): value is Journey {
  return typeof value === "string" && (JOURNEYS as readonly string[]).includes(value);
}

/** Below this many monthly listeners a song counts as underground (as the ledger's artists). */
export const UNDERGROUND_LISTENERS = 10_000;
const NEW_DAYS = 30;

export interface JourneyPlan {
  mode: DiscoveryMode;
  weights: FeatureWeights;
  explorationShare: number;
  jitter: number;
  filter: (candidate: Candidate) => boolean;
}

const unknownArtist = (taste: Taste) => (c: Candidate) => !taste.artists.has(c.artistId);
const knownGenre = (taste: Taste, c: Candidate) =>
  c.genreIds.some((id) => (taste.genres.get(id) ?? 0) > 0);
const recent = (now: number) => (c: Candidate) =>
  now - Date.parse(c.publishAt) < NEW_DAYS * 86_400_000;

/** How a journey ranks. Filters fall back to "anything not heard" when they leave too little. */
export function journeyPlan(journey: Journey, taste: Taste, now = Date.now()): JourneyPlan {
  const base = MODE_WEIGHTS.for_you;
  switch (journey) {
    case "surprise":
      // Wide and random, still good music: exploration-heavy with strong jitter.
      return {
        mode: "for_you",
        weights: base,
        explorationShare: 0.5,
        jitter: 1.5,
        filter: () => true,
      };
    case "something_new":
      return {
        mode: "new",
        weights: MODE_WEIGHTS.new,
        explorationShare: 0.2,
        jitter: 0.35,
        filter: (c) => recent(now)(c) && unknownArtist(taste)(c),
      };
    case "outside_taste":
      // Genres the listener has not shown any liking for, from artists they do not know.
      return {
        mode: "for_you",
        weights: { ...base, genre: 0, artist: 0, user: 0.5, completion: 2, save: 1.5 },
        explorationShare: 0,
        jitter: 0.6,
        filter: (c) => !knownGenre(taste, c) && unknownArtist(taste)(c),
      };
    case "underground":
      return {
        mode: "for_you",
        weights: { ...base, popularity: -1.5, completion: 1.5, save: 1.5 },
        explorationShare: 0.2,
        jitter: 0.5,
        filter: (c) => c.listeners30d < UNDERGROUND_LISTENERS && unknownArtist(taste)(c),
      };
    case "global":
      return {
        mode: "global",
        weights: { ...MODE_WEIGHTS.global, regional: -1 },
        explorationShare: 0.3,
        jitter: 0.5,
        filter: (c) => c.countryCode !== null && c.countryCode !== taste.country,
      };
    case "similar_to_me":
      return {
        mode: "for_you",
        weights: { ...base, user: 4, genre: 3.5, artist: 0.5 },
        explorationShare: 0.1,
        jitter: 0.35,
        filter: unknownArtist(taste),
      };
  }
}

/** Ranks a journey; if its filter leaves fewer than `size`, the rest is the plain feed ranking. */
export function rankJourney(
  journey: Journey,
  candidates: readonly Candidate[],
  taste: Taste,
  options: { size: number; seed: number; exclude?: ReadonlySet<string>; now?: number },
): RankedItem[] {
  const plan = journeyPlan(journey, taste, options.now);
  const notHeard = (c: Candidate) => !taste.heard.has(c.trackId);
  const first = rankFeed(candidates, taste, {
    mode: plan.mode,
    weights: plan.weights,
    explorationShare: plan.explorationShare,
    jitter: plan.jitter,
    filter: (c) => notHeard(c) && plan.filter(c),
    size: options.size,
    seed: options.seed,
    exclude: options.exclude,
    now: options.now,
  });
  if (first.length >= options.size) return first;
  const rest = rankFeed(candidates, taste, {
    mode: plan.mode,
    weights: plan.weights,
    explorationShare: plan.explorationShare,
    jitter: plan.jitter,
    filter: notHeard,
    size: options.size - first.length,
    seed: options.seed + 1,
    exclude: new Set([...(options.exclude ?? []), ...first.map((item) => item.trackId)]),
    now: options.now,
  });
  return [...first, ...rest];
}

export const DAILY_SIZE = 10;
export const WEEKLY_SECTIONS = [
  "new",
  "new_artists",
  "underground",
  "trending",
  "outside",
] as const;
export type WeeklySection = (typeof WEEKLY_SECTIONS)[number];
const PER_SECTION = 4;

export interface SetPick {
  trackId: string;
  section: string;
  reason: RankedItem["reason"];
}

/** Today's ten: new to the listener, ranked like For You with a bit more exploration. */
export function pickDaily(
  candidates: readonly Candidate[],
  taste: Taste,
  seed: number,
  now = Date.now(),
): SetPick[] {
  return rankFeed(candidates, taste, {
    mode: "for_you",
    explorationShare: 0.3,
    filter: (c) => !taste.heard.has(c.trackId),
    size: DAILY_SIZE,
    seed,
    now,
  }).map((item) => ({ trackId: item.trackId, section: "daily", reason: item.reason }));
}

/** This week's drop: four songs each of new releases, new artists, underground, trending, outside. */
export function pickWeekly(
  candidates: readonly Candidate[],
  taste: Taste,
  seed: number,
  now = Date.now(),
  /** Songs already picked elsewhere (today's Daily Discovery). */
  avoid: ReadonlySet<string> = new Set(),
): SetPick[] {
  const picked: SetPick[] = [];
  const used = new Set<string>(avoid);
  const sections: Record<WeeklySection, () => RankedItem[]> = {
    new: () =>
      rankJourney("something_new", candidates, taste, {
        size: PER_SECTION,
        seed,
        exclude: used,
        now,
      }),
    new_artists: () =>
      rankJourney("similar_to_me", candidates, taste, {
        size: PER_SECTION,
        seed: seed + 1,
        exclude: used,
        now,
      }),
    underground: () =>
      rankJourney("underground", candidates, taste, {
        size: PER_SECTION,
        seed: seed + 2,
        exclude: used,
        now,
      }),
    trending: () =>
      rankFeed(candidates, taste, {
        mode: "rising",
        explorationShare: 0,
        filter: (c) => !taste.heard.has(c.trackId),
        size: PER_SECTION,
        seed: seed + 3,
        exclude: used,
        now,
      }),
    outside: () =>
      rankJourney("outside_taste", candidates, taste, {
        size: PER_SECTION,
        seed: seed + 4,
        exclude: used,
        now,
      }),
  };
  for (const section of WEEKLY_SECTIONS) {
    for (const item of sections[section]()) {
      if (used.has(item.trackId)) continue;
      used.add(item.trackId);
      picked.push({ trackId: item.trackId, section, reason: item.reason });
    }
  }
  return picked;
}

/** A stable seed for a listener and a period (day/week start). */
export function periodSeed(userId: string, period: string): number {
  let hash = 2166136261;
  for (const char of `${userId}:${period}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 ** 31;
}
