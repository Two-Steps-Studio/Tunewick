import "server-only";

import { publicQuery } from "@/lib/supabase/public";

export const TRACK_CHARTS = [
  "top",
  "rising",
  "underground",
  "discovered",
  "saved",
  "shared",
] as const;
export type TrackChart = (typeof TRACK_CHARTS)[number];
export const ARTIST_CHARTS = ["rising", "underground", "new_listeners", "discovered"] as const;
export type ArtistChart = (typeof ARTIST_CHARTS)[number];
export const SCOPES = ["global", "country", "region", "city", "genre"] as const;
export type ChartScope = (typeof SCOPES)[number];
export const FRESH_WINDOWS = [24, 168, 720] as const;

export interface ChartQuery {
  scope: ChartScope;
  /** Country or region code, city name or genre slug. */
  code: string | null;
  /** Country of a city scene. */
  country: string | null;
}

export const getTrackChart = publicQuery(
  "charts:getTrackChart",
  300,
  async (supabase, chart: TrackChart, query: ChartQuery, limit: number = 100) => {
    const { data, error } = await supabase.rpc("music_chart", {
      chart,
      scope: query.scope,
      code: query.code ?? undefined,
      country: query.country ?? undefined,
      max_results: limit,
    });
    if (error) throw error;
    return data ?? [];
  },
);

export const getArtistChart = publicQuery(
  "charts:getArtistChart",
  300,
  async (supabase, chart: ArtistChart, query: ChartQuery, limit: number = 50) => {
    const { data, error } = await supabase.rpc("artist_chart", {
      chart,
      scope: query.scope === "city" ? "global" : query.scope,
      code: query.code ?? undefined,
      max_results: limit,
    });
    if (error) throw error;
    return data ?? [];
  },
);

export const getFreshReleases = publicQuery(
  "charts:getFreshReleases",
  60,
  async (supabase, hours: number, country: string | null, genre: string | null) => {
    const { data, error } = await supabase.rpc("fresh_releases", {
      hours,
      country: country ?? undefined,
      genre: genre ?? undefined,
    });
    if (error) throw error;
    return data ?? [];
  },
);

export const getWorldTracks = publicQuery(
  "charts:getWorldTracks",
  300,
  async (supabase, excludeCountry: string | null) => {
    const { data, error } = await supabase.rpc("world_tracks", {
      exclude_country: excludeCountry ?? undefined,
    });
    if (error) throw error;
    return data ?? [];
  },
);

export const getMusicCities = publicQuery(
  "charts:getMusicCities",
  300,
  async (supabase, country: string) => {
    const { data, error } = await supabase.rpc("music_cities", { country });
    if (error) throw error;
    return data ?? [];
  },
);
