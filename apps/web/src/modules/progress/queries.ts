import "server-only";

import {
  discoveryScore,
  diversity,
  goalsFor,
  levelFor,
  type Goal,
  type Level,
  type ProgressInput,
  type ReplayData,
} from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProgressSummary {
  timeZone: string;
  /** Total XP (everything in the ledger). */
  pointsTotal: number;
  pointsToday: number;
  pointsWeek: number;
  songsTotal: number;
  todaySongs: number;
  weekGenres: number;
  currentStreak: number;
  longestStreak: number;
  score: number;
  diversity: number;
  level: Level;
  goals: Goal[];
}

type ProgressJson = ProgressInput & {
  time_zone: string;
  points_total: number;
  discovery_points_total: number;
  points_today: number;
  points_week: number;
  songs_total: number;
  week_genres: number;
  current_streak: number;
  longest_streak: number;
  genre_spread: number[];
};

/** Points, score, level, streak and goals of the signed-in listener (null for visitors). */
export async function getMyProgress(): Promise<ProgressSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const { data, error } = await supabase.rpc("my_progress");
  if (error) throw error;
  const p = data as unknown as ProgressJson;
  const numbers = (value: unknown) =>
    value === null || value === undefined ? null : Number(value);
  const input: ProgressInput = {
    today_songs: p.today_songs,
    today_artists: p.today_artists,
    week_artists: p.week_artists,
    week_countries: p.week_countries,
    avg_daily_songs: numbers(p.avg_daily_songs),
    avg_daily_artists: numbers(p.avg_daily_artists),
    avg_weekly_artists: numbers(p.avg_weekly_artists),
    avg_weekly_countries: numbers(p.avg_weekly_countries),
  };
  const score = discoveryScore(p.discovery_points_total, p.genre_spread);
  return {
    timeZone: p.time_zone,
    pointsTotal: p.points_total,
    pointsToday: p.points_today,
    pointsWeek: p.points_week,
    songsTotal: p.songs_total,
    todaySongs: p.today_songs,
    weekGenres: p.week_genres,
    currentStreak: p.current_streak,
    longestStreak: p.longest_streak,
    score,
    diversity: diversity(p.genre_spread),
    level: levelFor(p.points_total),
    goals: goalsFor(input),
  };
}

export type StatsPeriod = "week" | "month" | "all";

/** Listening stats for this week / month (listener's time zone) or all time. */
export async function getMyStats(period: StatsPeriod) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_discovery_stats", { period });
  if (error) throw error;
  return data?.[0] ?? null;
}

export interface RecordValue {
  value: number;
  date: string;
}

export interface Records {
  most_songs_day: RecordValue | null;
  most_artists_week: RecordValue | null;
  longest_streak: number;
  countries: number;
  longest_session: RecordValue | null;
}

export async function getMyRecords(): Promise<Records> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_records");
  if (error) throw error;
  return data as unknown as Records;
}

export interface WeeklyRecap {
  week_start: string;
  listening_ms: number;
  songs: number;
  new_songs: number;
  new_artists: number;
  countries: number;
  genres: number;
  points: number;
  streak: number;
  biggest_discovery: { name: string; slug: string; ms: number } | null;
  top_genre: { slug: string; name_pl: string; name_en: string } | null;
  percentile: number | null;
}

export async function getMyWeeklyRecap(weeksAgo = 1): Promise<WeeklyRecap> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_weekly_recap", { weeks_ago: weeksAgo });
  if (error) throw error;
  return data as unknown as WeeklyRecap;
}

/** All achievements with the listener's unlock time (newly reached ones are unlocked first). */
export async function getMyAchievements() {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("refresh_my_achievements");
  const [all, mine] = await Promise.all([
    supabase.from("achievements").select("code, metric, threshold, position").order("position"),
    supabase.from("user_achievements").select("code, unlocked_at"),
  ]);
  if (all.error) throw all.error;
  if (mine.error) throw mine.error;
  const unlocked = new Map(mine.data.map((a) => [a.code, a.unlocked_at]));
  return all.data.map((a) => ({ ...a, unlockedAt: unlocked.get(a.code) ?? null }));
}

export type RankingPeriod = "week" | "month" | "season" | "last_season" | "all";

export interface RankingScope {
  period: RankingPeriod;
  country: string | null;
  region: string | null;
}

export async function getLeaderboard(scope: RankingScope) {
  const supabase = await createSupabaseServerClient();
  const args = {
    period: scope.period,
    country: scope.country ?? undefined,
    macro_region: scope.region ?? undefined,
    max_results: 50,
  };
  const { data: auth } = await supabase.auth.getClaims();
  const [board, mine] = await Promise.all([
    supabase.rpc("discovery_leaderboard", args),
    auth?.claims
      ? supabase.rpc("my_ranking", {
          period: scope.period,
          country: args.country,
          macro_region: args.macro_region,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (board.error) throw board.error;
  if (mine.error) throw mine.error;
  return { rows: board.data ?? [], me: mine.data?.[0] ?? null, signedIn: Boolean(auth?.claims) };
}

export type MissionCadence = "daily" | "weekly" | "monthly" | "event";

export interface Mission {
  cadence: MissionCadence;
  code: string;
  metric: string;
  target: number;
  xp: number;
  progress: number;
  completedAt: string | null;
  endsAt: string;
}

/** Missions running now (the same for everyone) with the listener's progress. */
export async function getMyMissions(): Promise<Mission[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_missions");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    cadence: m.cadence as MissionCadence,
    code: m.code,
    metric: m.metric,
    target: m.target,
    xp: m.xp,
    progress: m.progress,
    completedAt: m.completed_at ?? null,
    endsAt: m.ends_at,
  }));
}

/** The listener's final places in closed seasons, newest first. */
export async function getMySeasons() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("season_results")
    .select("season_start, points, rank, participants, percentile")
    .order("season_start", { ascending: false })
    .limit(8);
  if (error) throw error;
  return data;
}

export const LISTENING_PERIODS = ["7d", "30d", "90d", "year"] as const;
export type ListeningPeriod = (typeof LISTENING_PERIODS)[number];

export interface StatsArtist {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  image_id: string | null;
  plays: number;
  ms: number;
}
export interface StatsTrack {
  id: string;
  title: string;
  code: string;
  artist: string;
  artist_slug: string;
  artwork_image_id: string | null;
  plays: number;
  ms: number;
}
export interface StatsGenre {
  slug: string;
  name_pl: string;
  name_en: string;
  plays: number;
}

/** A period of the listener's statistics (`my_listening_stats`). */
export interface ListeningStats {
  starts: string;
  ends: string;
  listening_ms: number;
  plays: number;
  active_days: number;
  tracks: number;
  artists: number;
  albums: number;
  genres: number;
  countries: number;
  by_day: { day: string; ms: number }[];
  hours: number[];
  weekdays: number[];
  night_plays: number;
  top_day: { day: string; ms: number } | null;
  longest_session_ms: number;
  longest_streak: number;
  top_artists: StatsArtist[];
  top_tracks: StatsTrack[];
  top_albums: {
    id: string;
    title: string;
    slug: string;
    artist: string;
    artist_slug: string;
    artwork_image_id: string | null;
    plays: number;
  }[];
  top_genres: StatsGenre[];
  top_countries: { code: string; plays: number }[];
  new_songs: number;
  new_artists: number;
  new_genres: number;
  new_countries: number;
  underground: number;
  xp: number;
  discovery_xp: number;
  achievements: number;
  biggest_discovery: StatsArtist | null;
  top_discovered_genre: (Omit<StatsGenre, "plays"> & { songs: number }) | null;
  genre_spread: number[];
}

/** Local days [starts, ends) of a period ending today (the year is the calendar year so far). */
export function periodRange(period: ListeningPeriod, today: string) {
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const ends = day(1);
  const starts =
    period === "year"
      ? `${today.slice(0, 4)}-01-01`
      : day(1 - { "7d": 7, "30d": 30, "90d": 90 }[period]);
  return { starts, ends };
}

/** The signed-in listener's statistics for a period of their local days. */
export async function getMyListeningStats(period: ListeningPeriod): Promise<ListeningStats> {
  const supabase = await createSupabaseServerClient();
  const today = await supabase.rpc("my_today");
  if (today.error) throw today.error;
  const { starts, ends } = periodRange(period, today.data);
  const { data, error } = await supabase.rpc("my_listening_stats", { starts, ends });
  if (error) throw error;
  return data as unknown as ListeningStats;
}

/** "2026-09" → "2026-09-01"; null when it is not a month. */
export function parseMonth(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return `${value}-01`;
}

/** The month before `month` ("YYYY-MM-01") or after it, as "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

/** The signed-in listener's recap for a month ("YYYY-MM-01"); null outside their months. */
export async function getMyMonthRecap(month: string): Promise<ListeningStats | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_month_recap", { month_start: month });
  if (error) throw error;
  return (data as unknown as ListeningStats | null) ?? null;
}

/** The listener's local today ("YYYY-MM-DD"). */
export async function getMyToday(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_today");
  if (error) throw error;
  return data;
}

/** The signed-in listener's Replay for a year; null outside their years. */
export async function getMyReplay(year: number): Promise<ReplayData | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_replay", { replay_year: year });
  if (error) throw error;
  return (data as unknown as ReplayData | null) ?? null;
}
