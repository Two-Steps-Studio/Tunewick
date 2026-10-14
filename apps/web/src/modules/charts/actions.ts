"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayableQueue, listenerEntitlement } from "@/modules/audio";
import type { PlayerTrack } from "@/modules/player";

const ids = z.array(z.uuid()).min(1).max(20);

/**
 * A playable queue for chart rows (lazily, on the first tap - rendering a chart never presigns
 * audio). Keeps the chart order; tracks without processed audio are left out.
 */
export async function getChartPlayback(trackIds: string[]) {
  if (!ids.safeParse(trackIds).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, release_id, release:releases(artist:artists!releases_artist_id_fkey(name))")
    .in("id", trackIds);
  if (error || !data?.length) return null;
  const entitlement = await listenerEntitlement();
  const byId = new Map(data.map((row) => [row.id, row]));
  const playable = await getPlayableQueue(
    trackIds.flatMap((id) => {
      const row = byId.get(id);
      return row
        ? [
            {
              id: row.id,
              title: row.title,
              releaseId: row.release_id,
              artistName: row.release?.artist?.name ?? "",
            },
          ]
        : [];
    }),
    entitlement,
  );
  const tracks = playable.filter((t): t is PlayerTrack => t !== null);
  return tracks.length ? { tracks, entitlement } : null;
}
