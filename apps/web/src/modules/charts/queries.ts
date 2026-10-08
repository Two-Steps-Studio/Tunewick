import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function getTrackChart(chart: TrackChart, query: ChartQuery, limit = 100) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("music_chart", {
    chart,
    scope: query.scope,
    code: query.code ?? undefined,
    country: query.country ?? undefined,
    max_results: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getArtistChart(chart: ArtistChart, query: ChartQuery, limit = 50) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("artist_chart", {
    chart,
    scope: query.scope === "city" ? "global" : query.scope,
    code: query.code ?? undefined,
    max_results: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getFreshReleases(
  hours: number,
  country: string | null,
  genre: string | null,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("fresh_releases", {
    hours,
    country: country ?? undefined,
    genre: genre ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getWorldTracks(excludeCountry: string | null) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("world_tracks", {
    exclude_country: excludeCountry ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getMusicCities(country: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("music_cities", { country });
  if (error) throw error;
  return data ?? [];
}
