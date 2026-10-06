import "server-only";

import type { Database } from "@tunewick/shared";
import { isMediaStorageConfigured } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AudioUploadStatus = Database["public"]["Enums"]["audio_upload_status"];

export interface TrackAudio {
  id: string;
  status: AudioUploadStatus;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  rejectionMessage: string | null;
}

/** Whether masters can be uploaded on this deployment (storage configured). */
export function isAudioUploadAvailable() {
  return isMediaStorageConfigured();
}

/** Latest upload per track (RLS: members and staff only). */
export async function getLatestTrackAudio(trackIds: string[]): Promise<Map<string, TrackAudio>> {
  const latest = new Map<string, TrackAudio>();
  if (!trackIds.length) return latest;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("track_audio_uploads")
    .select("id, track_id, status, file_name, size_bytes, created_at, rejection_message")
    .in("track_id", trackIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const row of data) {
    if (latest.has(row.track_id)) continue;
    latest.set(row.track_id, {
      id: row.id,
      status: row.status,
      fileName: row.file_name,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      rejectionMessage: row.rejection_message,
    });
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
