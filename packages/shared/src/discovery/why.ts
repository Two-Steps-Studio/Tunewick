/**
 * "Why this song?" (docs/discovery-v2.md §2 V6): a short, honest explanation of the signal that
 * actually put a song in front of the listener. Message keys + values; the app translates. Numbers
 * appear only when they are real (listeners, finish rate, growth), never invented.
 */

import { UNDERGROUND_LISTENERS } from "./journeys";
import type { Reason } from "./rank";

export interface WhyFacts {
  artist: string;
  genre: string | null;
  country: string | null;
  /** Listeners of the song in the last 30 days. */
  listeners30d: number;
  listeners7d: number;
  listenersPrev7d: number;
  /** Share of listens heard to the end, 0..1. */
  completionRate: number;
  /** Days since release. */
  ageDays: number;
}

export interface WhyLine {
  key: string;
  values: Record<string, string | number>;
}

/** Below this many listens a finish rate says nothing. */
const MIN_LISTENERS_FOR_RATES = 5;

/** The main sentence and, when true, one more fact (small artist, fast growth, fresh). */
export function explain(reason: Reason, facts: WhyFacts): WhyLine[] {
  const lines: WhyLine[] = [];
  const v = { artist: facts.artist, genre: facts.genre ?? "", country: facts.country ?? "" };
  switch (reason.code) {
    case "followed_artist":
      lines.push({ key: "followed_artist", values: v });
      break;
    case "artist_you_like":
      lines.push({ key: "artist_you_like", values: v });
      break;
    case "genre_you_like":
      lines.push({ key: facts.genre ? "genre_you_like" : "genre_you_like_plain", values: v });
      break;
    case "listeners_like_you":
      lines.push({ key: "listeners_like_you", values: v });
      break;
    case "loved_by_listeners":
      lines.push(
        facts.listeners30d >= MIN_LISTENERS_FOR_RATES
          ? {
              key: "loved_by_listeners",
              values: { ...v, percent: Math.round(facts.completionRate * 100) },
            }
          : { key: "loved_by_listeners_plain", values: v },
      );
      break;
    case "near_you":
      lines.push({
        key: facts.country ? "near_you" : "popular",
        values: { ...v, listeners: facts.listeners30d },
      });
      break;
    case "popular":
      lines.push({ key: "popular", values: { ...v, listeners: facts.listeners30d } });
      break;
    case "rising":
      lines.push({
        key: "rising",
        values: { ...v, more: Math.max(0, facts.listeners7d - facts.listenersPrev7d) },
      });
      break;
    case "new_release":
      lines.push({ key: "new_release", values: { ...v, days: facts.ageDays } });
      break;
    case "new_genre":
      lines.push({ key: facts.genre ? "new_genre" : "wildcard", values: v });
      break;
    case "new_country":
      lines.push({ key: facts.country ? "new_country" : "wildcard", values: v });
      break;
    case "shared":
    case "artist_spotlight":
    case "daily_discovery":
    case "weekly_drop":
      lines.push({ key: reason.code, values: { ...v, section: reason.section ?? "" } });
      break;
    case "similar_to":
      lines.push({ key: "similar_to", values: { ...v, title: reason.title ?? "" } });
      break;
    case "wildcard":
      lines.push({ key: "wildcard", values: v });
      break;
  }
  if (facts.listeners30d === 0) {
    lines.push({ key: "first", values: {} });
  } else if (facts.listeners30d < UNDERGROUND_LISTENERS && reason.code !== "popular") {
    lines.push({ key: "small", values: { listeners: facts.listeners30d } });
  } else if (
    facts.listeners7d >= 3 &&
    facts.listeners7d >= facts.listenersPrev7d * 2 &&
    reason.code !== "rising"
  ) {
    lines.push({ key: "growing", values: { more: facts.listeners7d - facts.listenersPrev7d } });
  }
  return lines;
}
