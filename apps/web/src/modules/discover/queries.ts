import "server-only";

import { isVoivodeship, type Voivodeship } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Region from the URL (?woj=podlaskie); anything else means all of Poland. */
export function parseRegion(value: string | string[] | undefined): Voivodeship | null {
  return typeof value === "string" && isVoivodeship(value) ? value : null;
}

/** New releases (one per artist) and new artists, optionally from one voivodeship. */
export async function getDiscover(region: Voivodeship | null) {
  const supabase = await createSupabaseServerClient();
  const args = region ? { region, max_results: 12 } : { max_results: 12 };
  const [releases, artists] = await Promise.all([
    supabase.rpc("discover_releases", args),
    supabase.rpc("discover_artists", { ...args, max_results: 8 }),
  ]);
  if (releases.error) throw releases.error;
  if (artists.error) throw artists.error;
  return { releases: releases.data ?? [], artists: artists.data ?? [] };
}
