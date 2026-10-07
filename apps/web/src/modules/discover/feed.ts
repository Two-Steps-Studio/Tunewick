import "server-only";

import {
  EMPTY_TASTE,
  FEED,
  previewWindow,
  rankFeed,
  type Candidate,
  type Database,
  type DiscoveryMode,
  type Json,
  type RankedItem,
  type Taste,
} from "@tunewick/shared";
import { presignVariantGet } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getImageSourcesMany } from "@/modules/images";
import { getDiscoveryPreferences, getGenres } from "./preferences";
import type { DiscoveryPreferences, FeedItem, FeedPage } from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface TasteJson {
  artists: { id: string; w: number }[];
  genres: { id: number; w: number }[];
  countries: { code: string; w: number }[];
  co_followed: { artist: string; n: number }[];
  followed_artists: string[];
  heard: string[];
  recently_shown: string[];
  skipped: string[];
}

async function macroRegionOf(supabase: Supabase, country: string | null) {
  if (!country) return null;
  const { data } = await supabase
    .from("countries")
    .select("region")
    .eq("code", country)
    .maybeSingle();
  return data?.region ?? null;
}

/** The listener's taste: from the account's history, or from a visitor's onboarding choices. */
async function loadTaste(
  supabase: Supabase,
  preferences: DiscoveryPreferences,
  signedIn: boolean,
): Promise<Taste> {
  const macroRegion = await macroRegionOf(supabase, preferences.countryCode);
  const base: Taste = {
    ...EMPTY_TASTE,
    country: preferences.countryCode,
    macroRegion,
    languages: preferences.languages,
  };
  if (!signedIn) {
    return { ...base, genres: new Map(preferences.genreIds.map((id) => [id, 3])) };
  }
  const { data, error } = await supabase.rpc("my_taste");
  if (error) throw error;
  const taste = data as unknown as TasteJson;
  return {
    ...base,
    artists: new Map(taste.artists.map((a) => [a.id, Number(a.w)])),
    genres: new Map(taste.genres.map((g) => [g.id, Number(g.w)])),
    countries: new Map(taste.countries.map((c) => [c.code, Number(c.w)])),
    coFollowed: new Map(taste.co_followed.map((c) => [c.artist, c.n])),
    followed: new Set(taste.followed_artists),
    heard: new Set(taste.heard),
    recentlyShown: new Set(taste.recently_shown),
    skipped: new Set(taste.skipped),
  };
}

type CandidateRow = Database["public"]["Functions"]["discover_candidates"]["Returns"][number];

async function loadCandidates(
  supabase: Supabase,
  mode: DiscoveryMode,
  preferences: DiscoveryPreferences,
): Promise<CandidateRow[]> {
  const { data, error } = await supabase.rpc("discover_candidates", {
    mode,
    country: preferences.countryCode ?? undefined,
    hide_explicit: preferences.hideExplicit,
    max_results: 400,
  });
  if (error) throw error;
  return data ?? [];
}

function toCandidate(row: CandidateRow): Candidate {
  return {
    trackId: row.track_id,
    artistId: row.artist_id,
    genreIds: row.genre_ids ?? [],
    countryCode: row.country_code,
    macroRegion: row.macro_region,
    languages: row.languages ?? [],
    publishAt: row.publish_at,
    listeners30d: row.listeners_30d,
    listeners7d: row.listeners_7d,
    listenersPrev7d: row.listeners_prev_7d,
    plays30d: row.plays_30d,
    completionRate: row.completion_rate,
    replayRate: row.replay_rate,
    saveRate: row.save_rate,
    skipRate: row.skip_rate,
    countryListeners30d: row.country_listeners_30d,
  };
}

interface PreviewVariant {
  tier: string;
  object_key: string;
}

/** Signed preview URLs (Data Saver and High AAC) per track. */
async function previewSources(supabase: Supabase, trackIds: string[]) {
  const result = new Map<
    string,
    {
      window: ReturnType<typeof previewWindow>;
      sources: FeedItem["preview"]["sources"];
    }
  >();
  if (!trackIds.length) return result;
  const { data, error } = await supabase.rpc("track_previews", { tracks: trackIds });
  if (error) throw error;
  await Promise.all(
    (data ?? []).map(async (row) => {
      const variants = (row.variants as Json as unknown as PreviewVariant[]).filter(
        (v): v is PreviewVariant & { tier: "data_saver" | "high" } =>
          v.tier === "data_saver" || v.tier === "high",
      );
      const sources: FeedItem["preview"]["sources"] = [];
      for (const variant of variants) {
        const url = await presignVariantGet(variant.object_key);
        if (url) sources.push({ tier: variant.tier, url });
      }
      result.set(row.track_id, {
        window: previewWindow(row.duration_ms, row.preview_start_ms, row.preview_duration_ms),
        sources,
      });
    }),
  );
  return result;
}

async function libraryState(supabase: Supabase, trackIds: string[], artistIds: string[]) {
  const [likes, saves, follows] = await Promise.all([
    supabase.from("track_likes").select("track_id").in("track_id", trackIds),
    supabase.from("track_saves").select("track_id").in("track_id", trackIds),
    supabase.from("artist_follows").select("artist_id").in("artist_id", artistIds),
  ]);
  if (likes.error) throw likes.error;
  if (saves.error) throw saves.error;
  if (follows.error) throw follows.error;
  return {
    liked: new Set(likes.data.map((r) => r.track_id)),
    saved: new Set(saves.data.map((r) => r.track_id)),
    following: new Set(follows.data.map((r) => r.artist_id)),
  };
}

export interface FeedRequest {
  mode?: DiscoveryMode;
  /** Tracks already shown in this session. */
  exclude?: string[];
  seed: number;
  size?: number;
  /** Start with this track (shared link, "play in Discover"). */
  startCode?: string;
  /** "Discover this artist": their tracks first, then artists like them. */
  artistSlug?: string;
  locale: string;
}

/** One page of the Discover feed for the current listener (account or visitor). */
export async function getFeedPage(request: FeedRequest): Promise<FeedPage> {
  const supabase = await createSupabaseServerClient();
  const { preferences, signedIn } = await getDiscoveryPreferences();
  const mode = request.mode ?? preferences.mode;
  const size = request.size ?? FEED.pageSize;
  const exclude = new Set(request.exclude ?? []);

  const [rows, taste, genres] = await Promise.all([
    loadCandidates(supabase, mode, preferences),
    loadTaste(supabase, preferences, signedIn),
    getGenres(request.locale),
  ]);
  const byId = new Map(rows.map((row) => [row.track_id, row]));

  // Pinned items come first: a shared song, or an artist's best tracks.
  const pinned: RankedItem[] = [];
  const pin = (row: CandidateRow, code: RankedItem["reason"]["code"]) => {
    if (exclude.has(row.track_id) || pinned.some((p) => p.trackId === row.track_id)) return;
    pinned.push({ trackId: row.track_id, score: 0, exploration: false, reason: { code } });
  };
  if (request.startCode) {
    const start = rows.find((row) => row.public_code === request.startCode);
    if (start) pin(start, "shared");
  }
  let rankTaste = taste;
  if (request.artistSlug) {
    const own = rows
      .filter((row) => row.artist_slug === request.artistSlug)
      .sort((a, b) => b.listeners_30d - a.listeners_30d)
      .slice(0, 3);
    own.forEach((row) => pin(row, "artist_spotlight"));
    const artistId = own[0]?.artist_id;
    if (artistId) {
      const { data: similar } = await supabase.rpc("similar_artists", {
        artist: artistId,
        max_results: 12,
      });
      const coFollowed = new Map(taste.coFollowed);
      for (const s of similar ?? []) {
        coFollowed.set(s.artist_id, (coFollowed.get(s.artist_id) ?? 0) + 10 + s.shared_listeners);
      }
      rankTaste = { ...taste, coFollowed };
    }
  }

  const ranked = rankFeed(rows.map(toCandidate), rankTaste, {
    mode,
    size: Math.max(0, size - pinned.length),
    seed: request.seed,
    explorationShare: preferences.explorationShare,
    exclude: new Set([...exclude, ...pinned.map((p) => p.trackId)]),
  });
  const page = [...pinned, ...ranked].slice(0, size);
  const trackIds = page.map((item) => item.trackId);
  const pageRows = page.map((item) => byId.get(item.trackId)!);

  const [previews, covers, library] = await Promise.all([
    previewSources(supabase, trackIds),
    getImageSourcesMany(
      pageRows.map((row) => row.artwork_image_id ?? row.artist_image_id),
      640,
    ),
    signedIn && trackIds.length
      ? libraryState(supabase, trackIds, [...new Set(pageRows.map((row) => row.artist_id))])
      : Promise.resolve(null),
  ]);
  const genreById = new Map(genres.map((g) => [g.id, g]));

  const items: FeedItem[] = page.map((item, index) => {
    const row = pageRows[index]!;
    const preview = previews.get(row.track_id);
    const window = preview?.window ?? previewWindow(row.duration_ms, null, null);
    const imageId = row.artwork_image_id ?? row.artist_image_id;
    return {
      trackId: row.track_id,
      code: row.public_code,
      title: row.title,
      durationMs: row.duration_ms,
      explicit: row.explicit,
      artist: {
        id: row.artist_id,
        slug: row.artist_slug,
        name: row.artist_name,
        verified: row.verified,
      },
      release: { id: row.release_id, slug: row.release_slug, title: row.release_title },
      countryCode: row.country_code,
      city: row.city,
      genres: (row.genre_ids ?? []).flatMap((id) => {
        const genre = genreById.get(id);
        return genre ? [genre] : [];
      }),
      cover: imageId ? (covers.get(imageId) ?? null) : null,
      preview: { ...window, sources: preview?.sources ?? [] },
      reason: item.reason,
      exploration: item.exploration,
      liked: library ? library.liked.has(row.track_id) : null,
      saved: library ? library.saved.has(row.track_id) : null,
      following: library ? library.following.has(row.artist_id) : null,
    };
  });

  return { items, mode, signedIn, done: items.length < size, seed: request.seed };
}
