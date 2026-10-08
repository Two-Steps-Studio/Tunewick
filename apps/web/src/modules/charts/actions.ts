"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayableTracks, listenerEntitlement } from "@/modules/audio";
import type { PlayerTrack } from "@/modules/player";

const ids = z.array(z.uuid()).min(1).max(20);

/**
 * A playable queue for chart rows (lazily, on the first tap — rendering a chart never presigns
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
  const byRelease = new Map<string, { artist: string; tracks: { id: string; title: string }[] }>();
  for (const row of data) {
    const group = byRelease.get(row.release_id) ?? {
      artist: row.release?.artist?.name ?? "",
      tracks: [],
    };
    group.tracks.push({ id: row.id, title: row.title });
    byRelease.set(row.release_id, group);
  }
  const playable = new Map<string, PlayerTrack>();
  await Promise.all(
    [...byRelease].map(async ([releaseId, group]) => {
      for (const track of await getPlayableTracks(
        releaseId,
        group.tracks,
        group.artist,
        entitlement,
      )) {
        playable.set(track.id, track);
      }
    }),
  );
  const tracks = trackIds.map((id) => playable.get(id)).filter((t): t is PlayerTrack => !!t);
  return tracks.length ? { tracks, entitlement } : null;
}
