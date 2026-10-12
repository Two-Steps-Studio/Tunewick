/**
 * TuneWick Replay (docs/discovery-v2.md M14.7): the listener's year as a story, one screen per
 * fact. A screen is included only when its data is real and worth showing (no "0 countries"), so a
 * light year makes a shorter story rather than an empty one. At most 18 screens plus intro/outro.
 */

import { musicPersonality, type Personality } from "./personality";
import { discoveryScore } from "./progress";

interface Named {
  name: string;
  slug: string;
  image_id: string | null;
  plays: number;
  ms?: number;
}
interface Song {
  title: string;
  code: string;
  artist: string;
  artist_slug: string;
  artwork_image_id: string | null;
  plays: number;
}

/** The parts of `my_replay(year)` the story reads. */
export interface ReplayData {
  year: number;
  complete: boolean;
  stats: {
    listening_ms: number;
    plays: number;
    active_days: number;
    tracks: number;
    artists: number;
    genres: number;
    countries: number;
    night_plays: number;
    hours: number[];
    top_day: { day: string; ms: number } | null;
    longest_streak: number;
    top_artists: Named[];
    top_tracks: Song[];
    top_albums: { title: string; artist: string; artwork_image_id: string | null; plays: number }[];
    top_genres: { slug: string; name_pl: string; name_en: string; plays: number }[];
    top_countries: { code: string; plays: number }[];
    new_songs: number;
    new_artists: number;
    underground: number;
    discovery_xp: number;
    biggest_discovery: Named | null;
    genre_spread: number[];
  };
  months: { month: number; ms: number }[];
  first_song: (Omit<Song, "plays"> & { at: string }) | null;
  previous: {
    listening_ms: number;
    active_days: number;
    new_artists: number;
    discovery_xp: number;
  } | null;
}

export type ReplayScreen =
  | { kind: "intro"; year: number; complete: boolean }
  | { kind: "minutes"; ms: number; activeDays: number }
  | { kind: "first_song"; song: Omit<Song, "plays"> & { at: string } }
  | { kind: "top_month"; month: number; ms: number; months: { month: number; ms: number }[] }
  | { kind: "top_day"; day: string; ms: number }
  | { kind: "top_artist"; artist: Named }
  | { kind: "top_artists"; artists: Named[] }
  | { kind: "top_song"; song: Song }
  | { kind: "top_songs"; songs: Song[] }
  | { kind: "top_album"; album: ReplayData["stats"]["top_albums"][number] }
  | { kind: "top_genre"; genre: ReplayData["stats"]["top_genres"][number]; genres: number }
  | { kind: "countries"; countries: { code: string; plays: number }[]; count: number }
  | { kind: "new_artists"; count: number; songs: number }
  | { kind: "discovery"; artist: Named }
  | { kind: "underground"; count: number }
  | { kind: "listening_time"; hour: number; nightShare: number }
  | { kind: "streak"; days: number }
  | { kind: "personality"; personality: Personality }
  | { kind: "score"; score: number }
  | {
      kind: "year_vs_year";
      year: number;
      minutes: [number, number];
      newArtists: [number, number];
      score: [number, number];
    }
  | { kind: "outro"; year: number };

export const MAX_STORY_SCREENS = 18;

const DROP_FIRST: ReplayScreen["kind"][] = ["top_album", "top_day", "streak", "underground"];

/** Below this much listening a year is not a story (the page says so instead). */
export const MIN_REPLAY_PLAYS = 10;

export function replayStory(data: ReplayData): ReplayScreen[] {
  const s = data.stats;
  if (s.plays < MIN_REPLAY_PLAYS) return [];
  const screens: ReplayScreen[] = [];
  const add = (screen: ReplayScreen | null | false | undefined) => {
    if (screen) screens.push(screen);
  };
  const score = discoveryScore(s.discovery_xp, s.genre_spread);
  const best = [...data.months].sort((a, b) => b.ms - a.ms)[0];
  const busiest = s.hours.indexOf(Math.max(...s.hours));
  const personality = musicPersonality({
    plays: s.plays,
    tracks: s.tracks,
    artists: s.artists,
    countries: s.countries,
    night_plays: s.night_plays,
    new_artists: s.new_artists,
    underground: s.underground,
    top_genres: s.top_genres,
  });

  add({ kind: "minutes", ms: s.listening_ms, activeDays: s.active_days });
  add(data.first_song && { kind: "first_song", song: data.first_song });
  add(
    best &&
      best.ms > 0 && { kind: "top_month", month: best.month, ms: best.ms, months: data.months },
  );
  add(s.top_day && { kind: "top_day", day: s.top_day.day, ms: s.top_day.ms });
  add(s.top_artists[0] && { kind: "top_artist", artist: s.top_artists[0] });
  add(s.top_artists.length >= 3 && { kind: "top_artists", artists: s.top_artists.slice(0, 5) });
  add(s.top_tracks[0] && { kind: "top_song", song: s.top_tracks[0] });
  add(s.top_tracks.length >= 3 && { kind: "top_songs", songs: s.top_tracks.slice(0, 5) });
  add(s.top_albums[0] && { kind: "top_album", album: s.top_albums[0] });
  add(s.top_genres[0] && { kind: "top_genre", genre: s.top_genres[0], genres: s.genres });
  add(s.countries >= 2 && { kind: "countries", countries: s.top_countries, count: s.countries });
  add(s.new_artists > 0 && { kind: "new_artists", count: s.new_artists, songs: s.new_songs });
  add(s.biggest_discovery && { kind: "discovery", artist: s.biggest_discovery });
  add(s.underground > 0 && { kind: "underground", count: s.underground });
  add(
    s.plays > 0 && { kind: "listening_time", hour: busiest, nightShare: s.night_plays / s.plays },
  );
  add(s.longest_streak >= 2 && { kind: "streak", days: s.longest_streak });
  add(personality && { kind: "personality", personality: personality.personality });
  add(score > 0 && { kind: "score", score });
  add(
    data.previous &&
      data.previous.listening_ms > 0 && {
        kind: "year_vs_year",
        year: data.year - 1,
        minutes: [
          Math.round(data.previous.listening_ms / 60000),
          Math.round(s.listening_ms / 60000),
        ],
        newArtists: [data.previous.new_artists, s.new_artists],
        // The year before has no per-genre spread stored: compare plain discovery XP-based scores.
        score: [discoveryScore(data.previous.discovery_xp, []), discoveryScore(s.discovery_xp, [])],
      },
  );

  // Over the limit, the smaller facts give way first; the order of the story stays.
  for (const kind of DROP_FIRST) {
    if (screens.length <= MAX_STORY_SCREENS) break;
    const at = screens.findIndex((screen) => screen.kind === kind);
    if (at >= 0) screens.splice(at, 1);
  }
  return [
    { kind: "intro", year: data.year, complete: data.complete },
    ...screens.slice(0, MAX_STORY_SCREENS),
    { kind: "outro", year: data.year },
  ];
}
