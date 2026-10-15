import "server-only";

import {
  type Authenticity,
  type Database,
  type QualityTier,
  type SourceQuality,
  TIER_ORDER,
  tierRank,
} from "@tunewick/shared";
import { isMediaStorageConfigured, presignImageGet, presignVariantGet } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlayerTrack, TrackRendition, WorkerReport } from "@/modules/player";

export type AudioUploadStatus = Database["public"]["Enums"]["audio_upload_status"];

/** What the editor shows about a track's newest master. */
export interface TrackAudio {
  id: string;
  status: AudioUploadStatus;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  rejectionCode: string | null;
  rejectionMessage: string | null;
  durationMs: number | null;
  integratedLufs: number | null;
  /** From the worker report, when processed. */
  source: { codec: string; container: string; bits: number; sampleRate: number } | null;
  lossyOrigin: boolean;
  upsampledFrom: number | null;
  bitPadded: boolean;
  tiers: string[];
  /** Suggested preview start from the analysis (reports v2+). */
  bestMomentMs: number | null;
  /** 200 peaks, 0–100 (reports v2+). */
  waveform: number[];
}

type ReportShape = Partial<WorkerReport> & {
  analysis?:
    | (WorkerReport["analysis"] & {
        tiers?: Record<string, boolean>;
        best_moment?: { start_ms: number; duration_ms: number };
        waveform?: number[];
      })
    | null;
};

/** Whether masters can be uploaded on this deployment (storage configured). */
export function isAudioUploadAvailable() {
  return isMediaStorageConfigured();
}

function describe(row: {
  id: string;
  status: AudioUploadStatus;
  file_name: string;
  size_bytes: number;
  created_at: string;
  rejection_code: string | null;
  rejection_message: string | null;
  duration_ms: number | null;
  integrated_lufs: number | null;
  report: unknown;
}): TrackAudio {
  const report = (row.report ?? {}) as ReportShape;
  const analysis = report.analysis ?? null;
  return {
    id: row.id,
    status: row.status,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    rejectionCode: row.rejection_code,
    rejectionMessage: row.rejection_message,
    durationMs: row.duration_ms,
    integratedLufs: row.integrated_lufs === null ? null : Number(row.integrated_lufs),
    source: report.input
      ? {
          codec: report.input.codec,
          container: report.input.container,
          bits: report.input.bits,
          sampleRate: report.input.sample_rate,
        }
      : null,
    lossyOrigin: analysis?.authenticity === "suspected_lossy_origin",
    upsampledFrom: analysis?.upsampled_from ?? null,
    bitPadded: analysis?.flags?.includes("suspected_bit_padded") ?? false,
    // jsonb does not keep key order: list the tiers from lowest to highest.
    tiers: TIER_ORDER.filter((tier) => analysis?.tiers?.[tier]),
    bestMomentMs: analysis?.best_moment?.start_ms ?? null,
    waveform: Array.isArray(analysis?.waveform) ? analysis.waveform : [],
  };
}

/** Latest upload per track, plus the stored worker reports (RLS: members and staff only). */
export async function getLatestTrackAudio(trackIds: string[]): Promise<Map<string, TrackAudio>> {
  const latest = new Map<string, TrackAudio>();
  if (!trackIds.length) return latest;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("track_audio_uploads")
    .select(
      "id, track_id, status, file_name, size_bytes, created_at, rejection_code, rejection_message, duration_ms, integrated_lufs, report",
    )
    .in("track_id", trackIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const row of data) {
    if (!latest.has(row.track_id)) latest.set(row.track_id, describe(row));
  }
  return latest;
}

/** Release readiness for audio: every track has an accepted master. */
export function audioReadiness(trackIds: string[], audio: Map<string, TrackAudio>) {
  const statuses = trackIds.map((id) => audio.get(id)?.status);
  if (statuses.length && statuses.every((s) => s === "accepted")) return "ready" as const;
  if (statuses.some((s) => s === "uploaded" || s === "processing")) return "processing" as const;
  return "missing" as const;
}

interface PlaybackSource {
  container: string | null;
  codec: string | null;
  sample_rate: number | null;
  bits: number | null;
  effective_bits: number | null;
  effective_sample_rate: number | null;
  authenticity: string | null;
  upsampled_from: number | null;
  flags: string[];
}

interface PlaybackVariant {
  tier: QualityTier;
  codec: "aac_lc" | "flac";
  container: "flac" | "fmp4";
  sample_rate: number;
  bit_depth: number | null;
  nominal_kbps: number | null;
  bitrate_kbps: number;
  samples: number;
  encoder_delay_samples: number;
  padding_samples: number;
  object_key: string;
}

function sourceQuality(source: PlaybackSource): SourceQuality {
  const authenticity: Authenticity =
    source.authenticity === "suspected_lossy_origin"
      ? "suspected_lossy_origin"
      : source.upsampled_from
        ? "suspected_upsampled"
        : source.flags.includes("suspected_bit_padded")
          ? "suspected_bit_padded"
          : source.authenticity === "verified_lossless"
            ? "verified_lossless"
            : "unknown";
  const container = source.container ?? "";
  return {
    codec: container === "wav" || container === "aiff" ? container : (source.codec ?? "unknown"),
    isLosslessCodec: true, // only lossless masters are accepted
    sampleRateHz: source.sample_rate ?? 0,
    bitDepth: source.bits,
    effectiveBitDepth: source.effective_bits,
    effectiveSampleRateHz: source.effective_sample_rate,
    authenticity,
  };
}

interface ReleaseRequest {
  releaseId: string;
  tracks: { id: string; title: string }[];
  artistName: string;
}

/** Signed cover sizes (smallest first) from an image's variant list. */
async function signArtwork(variants: unknown): Promise<{ url: string; width: number }[]> {
  const list = (variants ?? []) as { width: number; key: string }[];
  const signed = await Promise.all(
    list.map(async (v) => ({ width: v.width, url: await presignImageGet(v.key) })),
  );
  return signed
    .filter((v): v is { width: number; url: string } => Boolean(v.url))
    .sort((a, b) => a.width - b.width);
}

/**
 * Playable tracks of many releases with one database call (`releases_playback`: playback and
 * cover per release), by release id, each in release order. Only the asked-for tracks; only
 * variants up to `maxTier` get a URL - a Free listener's page never contains a link to a Lossless
 * file. URLs are short-lived presigned GETs of the media bucket (signing is local, no request).
 */
async function playableReleases(
  requests: ReleaseRequest[],
  maxTier: QualityTier,
): Promise<Map<string, PlayerTrack[]>> {
  const result = new Map<string, PlayerTrack[]>();
  const ids = [...new Set(requests.map((r) => r.releaseId))];
  if (!ids.length) return result;
  const supabase = await createSupabaseServerClient();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const rows = (
    await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase.rpc("releases_playback", { releases: chunk });
        if (error) throw error;
        return data ?? [];
      }),
    )
  ).flat();

  const covers = new Map<string, Promise<{ url: string; width: number }[]>>();
  const byRelease = new Map(requests.map((r) => [r.releaseId, r]));
  // A release asked for twice (different tracks) is answered for all of its asked tracks.
  const asked = new Map<string, Map<string, string>>();
  for (const r of requests) {
    const titles = asked.get(r.releaseId) ?? new Map<string, string>();
    for (const t of r.tracks) titles.set(t.id, t.title);
    asked.set(r.releaseId, titles);
  }

  const tracks = await Promise.all(
    rows.map(async (row): Promise<PlayerTrack | null> => {
      const title = asked.get(row.release_id)?.get(row.track_id);
      if (title === undefined) return null;
      if (!covers.has(row.release_id)) covers.set(row.release_id, signArtwork(row.artwork));
      const variants = (row.variants as unknown as PlaybackVariant[]).filter(
        (variant) => tierRank(variant.tier) <= tierRank(maxTier),
      );
      const renditions: TrackRendition[] = [];
      for (const variant of variants) {
        const url = await presignVariantGet(variant.object_key);
        if (!url) continue;
        renditions.push({
          tier: variant.tier,
          codec: variant.codec,
          container: variant.container,
          sampleRateHz: variant.sample_rate,
          url,
          bitDepth: variant.bit_depth,
          bitrateKbps: variant.bitrate_kbps,
          nominalKbps: variant.nominal_kbps,
          samples: variant.samples,
          encoderDelaySamples: variant.encoder_delay_samples,
          paddingSamples: variant.padding_samples,
        });
      }
      if (!renditions.length) return null;
      const artwork = await covers.get(row.release_id)!;
      return {
        id: row.track_id,
        title,
        artist: byRelease.get(row.release_id)?.artistName ?? "",
        source: sourceQuality(row.source as unknown as PlaybackSource),
        renditions,
        ...(artwork.length ? { artwork } : {}),
      };
    }),
  );
  // Rows are in release order; keep it.
  rows.forEach((row, i) => {
    const track = tracks[i];
    if (!track) return;
    const list = result.get(row.release_id) ?? [];
    list.push(track);
    result.set(row.release_id, list);
  });
  return result;
}

/**
 * Playable tracks of a release the caller may see (public once released; members and staff
 * earlier), in release order (see playableReleases).
 */
export async function getPlayableTracks(
  releaseId: string,
  tracks: { id: string; title: string }[],
  artistName: string,
  maxTier: QualityTier,
): Promise<PlayerTrack[]> {
  const result = await playableReleases([{ releaseId, tracks, artistName }], maxTier);
  return result.get(releaseId) ?? [];
}

/**
 * Playable versions of tracks from many releases (library, playlists, search, charts), in the
 * given order, with one database call. Items without a playable variant come back as null, so
 * the caller can show them without a play button.
 */
export async function getPlayableQueue(
  items: { id: string; title: string; releaseId: string; artistName: string }[],
  maxTier: QualityTier,
): Promise<(PlayerTrack | null)[]> {
  const byRelease = new Map<string, ReleaseRequest>();
  for (const item of items) {
    const entry = byRelease.get(item.releaseId) ?? {
      releaseId: item.releaseId,
      artistName: item.artistName,
      tracks: [],
    };
    if (!entry.tracks.some((t) => t.id === item.id)) entry.tracks.push(item);
    byRelease.set(item.releaseId, entry);
  }
  const result = await playableReleases([...byRelease.values()], maxTier);
  const playable = new Map<string, PlayerTrack>();
  for (const list of result.values()) for (const track of list) playable.set(track.id, track);
  return items.map((item) => playable.get(item.id) ?? null);
}

export interface Soundcheck {
  track: PlayerTrack;
  /** Seconds into the track. */
  start: number;
  length: number;
}

/** Playable soundchecks (≤ 30 s excerpts) of public releases, by release id. */
export async function getSoundchecks(
  releases: { id: string; artistName: string }[],
  maxTier: QualityTier,
): Promise<Map<string, Soundcheck>> {
  const result = new Map<string, Soundcheck>();
  if (!releases.length) return result;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("release_soundchecks", {
    releases: releases.map((r) => r.id),
  });
  if (error) throw error;
  const rows = data ?? [];
  const playable = await playableReleases(
    rows.map((row) => ({
      releaseId: row.release_id,
      tracks: [{ id: row.track_id, title: row.title }],
      artistName: releases.find((r) => r.id === row.release_id)?.artistName ?? "",
    })),
    maxTier,
  );
  for (const row of rows) {
    const track = playable.get(row.release_id)?.find((t) => t.id === row.track_id);
    if (track) {
      result.set(row.release_id, {
        track,
        start: row.start_ms / 1000,
        length: row.duration_ms / 1000,
      });
    }
  }
  return result;
}
