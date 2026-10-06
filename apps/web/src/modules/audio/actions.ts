"use server";

import { revalidatePath } from "next/cache";
import { ingestObjectSize, presignIngestUpload } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkMasterFile, type UploadError } from "./validation";

export type StartResult =
  { ok: true; uploadId: string; url: string } | { ok: false; error: UploadError };
export type FinishResult = { ok: true } | { ok: false; error: UploadError };

function dbError(code: string | undefined): UploadError {
  if (code === "22023") return "unsupported_type";
  if (code === "23514") return "too_large";
  if (code === "54000") return "too_many";
  if (code === "42501") return "not_allowed";
  return "failed";
}

/** Registers the upload and returns a presigned URL; the browser sends the file straight to storage. */
export async function startAudioUpload(
  trackId: string,
  fileName: string,
  sizeBytes: number,
): Promise<StartResult> {
  const problem = checkMasterFile(fileName, sizeBytes);
  if (problem) return { ok: false, error: problem };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("begin_audio_upload", {
    track: trackId,
    file_name: fileName,
    size_bytes: sizeBytes,
  });
  if (error || !data) return { ok: false, error: dbError(error?.code) };

  try {
    return { ok: true, uploadId: data.id, url: await presignIngestUpload(data.object_key) };
  } catch {
    await supabase.rpc("abandon_audio_upload", { upload: data.id, reason: "storage_unavailable" });
    return { ok: false, error: "unavailable" };
  }
}

/** Checks the object really landed with the announced size, then marks the upload uploaded. */
export async function finishAudioUpload(uploadId: string): Promise<FinishResult> {
  const supabase = await createSupabaseServerClient();
  const { data: upload } = await supabase
    .from("track_audio_uploads")
    .select("id, object_key, size_bytes, status")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.status !== "pending") return { ok: false, error: "not_allowed" };

  let size: number | null;
  try {
    size = await ingestObjectSize(upload.object_key);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (size !== upload.size_bytes) {
    await supabase.rpc("abandon_audio_upload", { upload: uploadId, reason: "size_mismatch" });
    revalidatePath("/", "layout");
    return { ok: false, error: "incomplete" };
  }

  const { error } = await supabase.rpc("complete_audio_upload", { upload: uploadId });
  revalidatePath("/", "layout");
  return error ? { ok: false, error: dbError(error.code) } : { ok: true };
}

/** The browser reports a failed transfer. */
export async function abandonAudioUpload(uploadId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("abandon_audio_upload", { upload: uploadId, reason: "transfer_failed" });
  revalidatePath("/", "layout");
}
