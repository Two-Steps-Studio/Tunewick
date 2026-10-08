import "server-only";

import {
  discoveryScore,
  diversity,
  goalsFor,
  levelFor,
  type Goal,
  type Level,
  type ProgressInput,
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

export interface Challenge {
  code: string;
  metric: string;
  target: number;
  progress: number;
  completedAt: string | null;
  endsAt: string;
}

/** This week's challenges (the same for everyone) with the listener's progress. */
export async function getMyChallenges(): Promise<Challenge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_challenges");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    code: c.code,
    metric: c.metric,
    target: c.target,
    progress: c.progress,
    completedAt: c.completed_at ?? null,
    endsAt: c.ends_at,
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
