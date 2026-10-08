/**
 * Discovery progress (docs/discovery-expansion.md §5): score, level, adaptive goals, preview window.
 * Inputs come from the database ledger; these functions only turn them into numbers people see.
 */

import { DIVERSITY_REFERENCE_GENRES, GOALS, LEVELS, PREVIEW, type LevelTitle } from "./config";

/**
 * How evenly discoveries spread over genres: Shannon entropy relative to an even spread over
 * DIVERSITY_REFERENCE_GENRES genres, 0..1. One genre → 0; twelve genres evenly → 1.
 */
export function diversity(genreCounts: readonly number[]): number {
  const counts = genreCounts.filter((n) => n > 0);
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (counts.length < 2 || total === 0) return 0;
  const entropy = -counts.reduce((sum, n) => sum + (n / total) * Math.log(n / total), 0);
  return Math.min(1, entropy / Math.log(DIVERSITY_REFERENCE_GENRES));
}

/** Discovery Score: lifetime points × 10, up to +25 % for diverse discovering. */
export function discoveryScore(points: number, genreCounts: readonly number[]): number {
  return Math.round(10 * Math.max(0, points) * (0.8 + 0.2 * diversity(genreCounts)));
}

export interface Level {
  level: number;
  title: LevelTitle;
  /** Score where this level starts and the next one starts. */
  floor: number;
  next: number;
  /** 0..1 towards the next level. */
  progress: number;
}

export function levelFor(score: number): Level {
  const { thresholds, titles, stepAfter } = LEVELS;
  const last = thresholds.length - 1;
  let index = 0;
  while (index < last && score >= thresholds[index + 1]!) index++;
  let level = index + 1;
  let floor: number = thresholds[index]!;
  let next: number = index < last ? thresholds[index + 1]! : floor + stepAfter;
  if (index === last && score >= next) {
    const extra = Math.floor((score - floor) / stepAfter);
    level += extra;
    floor += extra * stepAfter;
    next = floor + stepAfter;
  }
  return {
    level,
    title: titles[Math.min(index, titles.length - 1)]!,
    floor,
    next,
    progress: Math.min(1, Math.max(0, (score - floor) / (next - floor))),
  };
}

/** Rounds a goal to a friendly number (5, 10, 15 … above 10). */
function friendly(value: number) {
  return value > 10 ? Math.round(value / 5) * 5 : Math.round(value);
}

function adaptive(average: number | null, rule: { min: number; max: number; fallback: number }) {
  if (average === null || average <= 0) return rule.fallback;
  const target = friendly(average * GOALS.stretch + 1);
  return Math.min(rule.max, Math.max(rule.min, target));
}

export type GoalKey = "daily_songs" | "daily_artists" | "weekly_countries" | "weekly_artists";

export interface Goal {
  key: GoalKey;
  period: "daily" | "weekly";
  target: number;
  value: number;
  done: boolean;
}

/** What `my_progress()` returns (the fields goals need). */
export interface ProgressInput {
  today_songs: number;
  today_artists: number;
  week_artists: number;
  week_countries: number;
  avg_daily_songs: number | null;
  avg_daily_artists: number | null;
  avg_weekly_artists: number | null;
  avg_weekly_countries: number | null;
}

/**
 * Light goals that follow the listener's own pace: a bit above their recent average, within
 * bounds — never a chore for someone who listens a little.
 */
export function goalsFor(progress: ProgressInput): Goal[] {
  const goal = (key: GoalKey, period: Goal["period"], target: number, value: number): Goal => ({
    key,
    period,
    target,
    value,
    done: value >= target,
  });
  return [
    goal(
      "daily_artists",
      "daily",
      adaptive(progress.avg_daily_artists, GOALS.daily.artists),
      progress.today_artists,
    ),
    goal(
      "daily_songs",
      "daily",
      adaptive(progress.avg_daily_songs, GOALS.daily.songs),
      progress.today_songs,
    ),
    goal(
      "weekly_countries",
      "weekly",
      adaptive(progress.avg_weekly_countries, GOALS.weekly.countries),
      progress.week_countries,
    ),
    goal(
      "weekly_artists",
      "weekly",
      adaptive(progress.avg_weekly_artists, GOALS.weekly.artists),
      progress.week_artists,
    ),
  ];
}

export interface PreviewWindow {
  startMs: number;
  lengthMs: number;
  /** True when the artist chose it (soundcheck). */
  chosen: boolean;
}

/**
 * The part of a track the feed plays: the artist's soundcheck when set, else the best moment the
 * audio analysis found, else 30 s from about a third in. Short tracks play from the start.
 */
export function previewWindow(
  durationMs: number | null,
  soundcheckStartMs: number | null,
  soundcheckLengthMs: number | null,
  suggestedStartMs: number | null = null,
): PreviewWindow {
  const duration = durationMs ?? 0;
  if (
    soundcheckStartMs !== null &&
    soundcheckLengthMs !== null &&
    (!duration || soundcheckStartMs < duration)
  ) {
    const length = duration
      ? Math.min(soundcheckLengthMs, duration - soundcheckStartMs)
      : soundcheckLengthMs;
    return { startMs: soundcheckStartMs, lengthMs: length, chosen: true };
  }
  if (!duration) return { startMs: 0, lengthMs: PREVIEW.lengthMs, chosen: false };
  const length = Math.min(PREVIEW.lengthMs, duration);
  if (suggestedStartMs !== null && suggestedStartMs >= 0 && suggestedStartMs + length <= duration) {
    return { startMs: suggestedStartMs, lengthMs: length, chosen: false };
  }
  const start =
    Math.round(Math.min(duration * PREVIEW.startFraction, duration - length) / 1000) * 1000;
  return { startMs: Math.max(0, start), lengthMs: length, chosen: false };
}

/** The running season (a calendar quarter, UTC) and when it ends. */
export function currentSeason(now = new Date()) {
  const quarter = Math.floor(now.getUTCMonth() / 3);
  return {
    year: now.getUTCFullYear(),
    quarter: quarter + 1,
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), quarter * 3 + 3, 1)),
  };
}

/** "2026-07-01" → { year: 2026, quarter: 3 }. */
export function seasonOf(start: string) {
  return {
    year: Number(start.slice(0, 4)),
    quarter: Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1,
  };
}
