import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AtlasCountry {
  country_code: string;
  region: string;
  artists: number;
  listeners_7d: number | null;
  discovered: boolean;
}

/** Countries with music on Tunewick (and, signed in, which ones you have heard). */
export async function getAtlasCountries(): Promise<AtlasCountry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("atlas_countries");
  if (error) throw error;
  return (data ?? []) as AtlasCountry[];
}

export interface AtlasGenre {
  slug: string;
  name_pl: string;
  name_en: string;
}

export interface AtlasCountryPage {
  artists: number;
  cities: { city: string; artists: number }[];
  genres: (AtlasGenre & { artists: number })[];
  top_artists: {
    slug: string;
    name: string;
    image_id: string | null;
    city: string | null;
    listeners_30d: number | null;
  }[];
}

export async function getAtlasCountry(code: string): Promise<AtlasCountryPage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("atlas_country", { code });
  if (error) throw error;
  return (data as unknown as AtlasCountryPage | null) ?? null;
}

export interface AtlasCityPage {
  artists: { slug: string; name: string; image_id: string | null }[];
  genres: AtlasGenre[];
  venues: { slug: string; name: string; upcoming: number }[];
  events: {
    id: string;
    title: string;
    starts_at: string;
    venue: string;
    venue_slug: string;
    artist: string;
    artist_slug: string;
  }[];
}

export async function getAtlasCity(code: string, city: string): Promise<AtlasCityPage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("atlas_city", { code, city });
  if (error) throw error;
  return (data as unknown as AtlasCityPage | null) ?? null;
}

/** "PL" ↔ "pl" in URLs; null when it is not a country code. */
export function parseCountryParam(value: string): string | null {
  return /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : null;
}
