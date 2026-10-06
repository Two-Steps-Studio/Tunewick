"use server";

import { revalidatePath } from "next/cache";
import { ingestObjectSize, presignIngestUpload } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkImageFile,
  type ImageKind,
  imageExtension,
  type ImageUploadError,
} from "./validation";

export type StartImageResult =
  { ok: true; imageId: string; url: string } | { ok: false; error: ImageUploadError };
export type FinishImageResult = { ok: true } | { ok: false; error: ImageUploadError };

function dbError(code: string | undefined): ImageUploadError {
  if (code === "22023") return "unsupported_type";
  if (code === "23514") return "too_large";
  if (code === "54000") return "too_many";
  if (code === "42501") return "not_allowed";
  return "failed";
}

export async function startImageUpload(
  kind: ImageKind,
  ownerId: string,
  fileName: string,
  sizeBytes: number,
): Promise<StartImageResult> {
  const problem = checkImageFile(fileName, sizeBytes);
  if (problem) return { ok: false, error: problem };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("begin_image_upload", {
    kind,
    owner: ownerId,
    extension: imageExtension(fileName)!,
    size_bytes: sizeBytes,
  });
  if (error || !data) return { ok: false, error: dbError(error?.code) };
  try {
    return { ok: true, imageId: data.id, url: await presignIngestUpload(data.object_key) };
  } catch {
    await supabase.rpc("abandon_image_upload", { image: data.id });
    return { ok: false, error: "unavailable" };
  }
}

export async function finishImageUpload(imageId: string): Promise<FinishImageResult> {
  const supabase = await createSupabaseServerClient();
  const { data: image } = await supabase
    .from("images")
    .select("id, object_key, size_bytes, status")
    .eq("id", imageId)
    .maybeSingle();
  if (!image || image.status !== "pending") return { ok: false, error: "not_allowed" };

  let size: number | null;
  try {
    size = await ingestObjectSize(image.object_key);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (size !== image.size_bytes) {
    await supabase.rpc("abandon_image_upload", { image: imageId });
    revalidatePath("/", "layout");
    return { ok: false, error: "incomplete" };
  }
  const { error } = await supabase.rpc("complete_image_upload", { image: imageId });
  revalidatePath("/", "layout");
  return error ? { ok: false, error: dbError(error.code) } : { ok: true };
}

export async function abandonImageUpload(imageId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("abandon_image_upload", { image: imageId });
  revalidatePath("/", "layout");
}
