/**
 * Music Personality (docs/discovery-v2.md M14.5): what a listener's own statistics say about how
 * they listen. Every trait comes from a real ratio with a threshold; the strongest one (relative to
 * its threshold) is the personality. Too little listening gives no personality rather than a guess.
 */

export const PERSONALITIES = [
  "explorer",
  "night_listener",
  "underground_hunter",
  "global_discoverer",
  "genre_hopper",
  "repeat_master",
] as const;
export type Personality = (typeof PERSONALITIES)[number];

/** The parts of a period's statistics (`my_listening_stats`) the personality reads. */
export interface PersonalityStats {
  plays: number;
  tracks: number;
  artists: number;
  countries: number;
  night_plays: number;
  new_artists: number;
  underground: number;
  top_genres: { plays: number }[];
}

export interface Trait {
  personality: Personality;
  /** The measured value: a share 0..1, or a count for countries / plays per song. */
  value: number;
  /** Value relative to the trait's threshold; ≥ 1 means the trait holds. */
  strength: number;
}

/** Below this many plays a period says too little about anyone. */
export const MIN_PLAYS_FOR_PERSONALITY = 20;

const THRESHOLDS: Record<Personality, number> = {
  // Half of the artists heard were new.
  explorer: 0.5,
  // 40% of plays between 22:00 and 05:00.
  night_listener: 0.4,
  // A third of the artists heard were small (under the underground line).
  underground_hunter: 0.33,
  // Artists from at least six countries.
  global_discoverer: 6,
  // No genre takes more than a third of the plays (needs several genres).
  genre_hopper: 1 / 3,
  // Each song played four times on average.
  repeat_master: 4,
};

/** Every trait with its measured value, strongest first. */
export function traits(stats: PersonalityStats): Trait[] {
  const genrePlays = stats.top_genres.reduce((sum, g) => sum + g.plays, 0);
  const topGenreShare =
    stats.top_genres.length >= 3 && genrePlays > 0 ? stats.top_genres[0]!.plays / genrePlays : 1;
  const values: Record<Personality, number> = {
    explorer: stats.artists > 0 ? Math.min(1, stats.new_artists / stats.artists) : 0,
    night_listener: stats.plays > 0 ? stats.night_plays / stats.plays : 0,
    underground_hunter: stats.artists > 0 ? Math.min(1, stats.underground / stats.artists) : 0,
    global_discoverer: stats.countries,
    genre_hopper: topGenreShare,
    repeat_master: stats.tracks > 0 ? stats.plays / stats.tracks : 0,
  };
  return PERSONALITIES.map((personality) => {
    const value = values[personality];
    const threshold = THRESHOLDS[personality];
    // Genre hopping is the one trait where lower is stronger.
    const strength =
      personality === "genre_hopper" ? (value > 0 ? threshold / value : 0) : value / threshold;
    return { personality, value, strength };
  }).sort((a, b) => b.strength - a.strength);
}

/** The personality for a period, or null when there is too little listening to tell. */
export function musicPersonality(
  stats: PersonalityStats,
): { personality: Personality; traits: Trait[] } | null {
  if (stats.plays < MIN_PLAYS_FOR_PERSONALITY) return null;
  const all = traits(stats);
  const held = all.filter((t) => t.strength >= 1);
  // Nothing stands out: the closest trait still describes the listener best.
  return { personality: (held[0] ?? all[0]!).personality, traits: held };
}
