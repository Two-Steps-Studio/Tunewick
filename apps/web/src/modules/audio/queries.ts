import "server-only";

import { TIER_ORDER, type Database } from "@tunewick/shared";
import { isMediaStorageConfigured, presignVariantGet } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { trackFromWorkerReport, type PlayerTrack, type WorkerReport } from "@/modules/player";

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
}

type ReportShape = Partial<WorkerReport> & {
  analysis?: (WorkerReport["analysis"] & { tiers?: Record<string, boolean> }) | null;
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

/**
 * Playable tracks for members to preview their processed masters, in release order. URLs are
 * short-lived presigned GETs of the media bucket.
 */
export async function getPreviewTracks(
  tracks: { id: string; title: string }[],
  artistName: string,
  audio: Map<string, TrackAudio>,
): Promise<PlayerTrack[]> {
  const accepted = tracks.filter((track) => audio.get(track.id)?.status === "accepted");
  if (!accepted.length) return [];
  const uploadIds = accepted.map((track) => audio.get(track.id)!.id);

  const supabase = await createSupabaseServerClient();
  const [{ data: uploads }, { data: variants }] = await Promise.all([
    supabase.from("track_audio_uploads").select("id, report").in("id", uploadIds),
    supabase
      .from("track_audio_variants")
      .select("upload_id, object_key")
      .in("upload_id", uploadIds),
  ]);
  if (!uploads || !variants) return [];

  const result: PlayerTrack[] = [];
  for (const track of accepted) {
    const uploadId = audio.get(track.id)!.id;
    const report = uploads.find((u) => u.id === uploadId)?.report as WorkerReport | undefined;
    if (!report) continue;
    const urls = new Map<string, string>();
    for (const variant of variants.filter((v) => v.upload_id === uploadId)) {
      const url = await presignVariantGet(variant.object_key);
      if (url) urls.set(variant.object_key.split("/").pop()!, url);
    }
    const playable = trackFromWorkerReport(
      report,
      { id: track.id, title: track.title, artist: artistName },
      (name) => urls.get(name) ?? "",
    );
    if (playable) {
      playable.renditions = playable.renditions.filter((rendition) => rendition.url);
      if (playable.renditions.length) result.push(playable);
    }
  }
  return result;
}
