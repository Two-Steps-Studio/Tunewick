import "server-only";

import { isVoivodeship, type Voivodeship } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Region from the URL (?woj=podlaskie); anything else means the whole country. */
export function parseRegion(value: string | string[] | undefined): Voivodeship | null {
  return typeof value === "string" && isVoivodeship(value) ? value : null;
}

/** Country from the URL (?country=DE); anything else means every country. */
export function parseCountry(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : null;
}

/** New releases (one per artist) and new artists, optionally from one country / voivodeship. */
export async function getDiscover(region: Voivodeship | null, country: string | null = null) {
  const supabase = await createSupabaseServerClient();
  const args = {
    max_results: 12,
    ...(region ? { region } : {}),
    ...(country ? { country } : {}),
  };
  const [releases, artists, countries] = await Promise.all([
    supabase.rpc("discover_releases", args),
    supabase.rpc("discover_artists", { ...args, max_results: 8 }),
    supabase.rpc("browse_countries"),
  ]);
  if (releases.error) throw releases.error;
  if (artists.error) throw artists.error;
  if (countries.error) throw countries.error;
  return {
    releases: releases.data ?? [],
    artists: artists.data ?? [],
    countries: countries.data ?? [],
  };
}
