import "server-only";

import type { Database } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SearchHit = Database["public"]["Functions"]["search_catalog"]["Returns"][number];

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;

/** Public catalog search (artists, releases, tracks), grouped by kind and ranked. */
export async function searchCatalog(query: string) {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  const empty = { query: q, artists: [], releases: [], tracks: [] } as {
    query: string;
    artists: SearchHit[];
    releases: SearchHit[];
    tracks: SearchHit[];
  };
  if (q.length < MIN_QUERY_LENGTH) return empty;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_catalog", { query: q, max_results: 8 });
  if (error) throw error;
  for (const hit of data ?? []) {
    if (hit.kind === "artist") empty.artists.push(hit);
    else if (hit.kind === "release") empty.releases.push(hit);
    else empty.tracks.push(hit);
  }
  return empty;
}
