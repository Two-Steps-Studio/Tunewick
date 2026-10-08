import "server-only";

import { periodSeed, pickDaily, pickWeekly, type Taste } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getImageSourcesMany, type ImageSources } from "@/modules/images";
import { loadCandidates, loadTaste, toCandidate, type CandidateRow } from "./feed";
import { getDiscoveryPreferences } from "./preferences";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type SetKind = "daily" | "weekly";

export interface StoredSetItem {
  track_id: string;
  section: string;
  reason?: string;
  genre_id?: number;
  country_code?: string;
}

export interface StoredSet {
  period_start: string;
  items: StoredSetItem[];
  completed_at: string | null;
  progress: number;
  target: number;
}

/**
 * The listener's set for the current day/week: the stored one, or a new one picked from the same
 * candidates and taste as the feed (and stored — the first pick of a period wins).
 */
export async function ensureSet(
  supabase: Supabase,
  kind: SetKind,
  rows: CandidateRow[],
  taste: Taste,
  /** Songs not to pick again (the Weekly Drop avoids today's Daily Discovery). */
  avoid: ReadonlySet<string> = new Set(),
): Promise<StoredSet | null> {
  const existing = await supabase.rpc("my_discovery_set", { kind });
  if (existing.error) throw existing.error;
  if (existing.data?.[0]) return existing.data[0] as unknown as StoredSet;

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const seed = periodSeed(userId, `${kind}:${new Date().toISOString().slice(0, 10)}`);
  const candidates = rows.map(toCandidate);
  const picks =
    kind === "daily"
      ? pickDaily(candidates, taste, seed)
      : pickWeekly(candidates, taste, seed, Date.now(), avoid);
  if (!picks.length) return null;
  const saved = await supabase.rpc("save_discovery_set", {
    set_kind: kind,
    chosen: picks.map((p) => ({
      track_id: p.trackId,
      section: p.section,
      reason: p.reason.code,
      genre_id: p.reason.genreId,
      country_code: p.reason.countryCode,
    })),
  });
  if (saved.error) throw saved.error;
  return (saved.data?.[0] as unknown as StoredSet) ?? null;
}

export interface SetTrack {
  trackId: string;
  code: string;
  title: string;
  section: string;
  artist: { slug: string; name: string };
  countryCode: string | null;
  cover: ImageSources | null;
  heard: boolean;
}

export interface DiscoverySetView {
  kind: SetKind;
  periodStart: string;
  completed: boolean;
  progress: number;
  target: number;
  tracks: SetTrack[];
}

/** Today's Daily Discovery and this week's Weekly Drop for the Today page (signed-in only). */
export async function getDiscoverySets(): Promise<DiscoverySetView[] | null> {
  const supabase = await createSupabaseServerClient();
  const { preferences, signedIn } = await getDiscoveryPreferences();
  if (!signedIn) return null;
  const [rows, taste] = await Promise.all([
    loadCandidates(supabase, "for_you", preferences),
    loadTaste(supabase, preferences, true),
  ]);
  const byId = new Map(rows.map((row) => [row.track_id, row]));
  const daily = await ensureSet(supabase, "daily", rows, taste);
  const weekly = await ensureSet(
    supabase,
    "weekly",
    rows,
    taste,
    new Set((daily?.items ?? []).map((i) => i.track_id)),
  );
  const sets = [
    { kind: "daily" as const, set: daily },
    { kind: "weekly" as const, set: weekly },
  ];
  const images = await getImageSourcesMany(
    sets.flatMap(({ set }) =>
      (set?.items ?? []).map((i) => {
        const row = byId.get(i.track_id);
        return row ? (row.artwork_image_id ?? row.artist_image_id) : null;
      }),
    ),
    240,
  );
  return sets.flatMap(({ kind, set }) => {
    if (!set) return [];
    const tracks = set.items.flatMap((item) => {
      const row = byId.get(item.track_id);
      if (!row) return [];
      const imageId = row.artwork_image_id ?? row.artist_image_id;
      return [
        {
          trackId: row.track_id,
          code: row.public_code,
          title: row.title,
          section: item.section,
          artist: { slug: row.artist_slug, name: row.artist_name },
          countryCode: row.country_code,
          cover: imageId ? (images.get(imageId) ?? null) : null,
          heard: taste.heard.has(row.track_id),
        },
      ];
    });
    return [
      {
        kind,
        periodStart: set.period_start,
        completed: Boolean(set.completed_at),
        progress: set.progress,
        target: set.target,
        tracks,
      },
    ];
  });
}
