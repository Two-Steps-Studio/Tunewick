import "server-only";

import type { Database } from "@tunewick/shared";
import { presignImageGet } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ImageKind } from "./validation";

type ImageRow = Database["public"]["Tables"]["images"]["Row"];

/** What the browser needs to show a processed image: URLs per width and a placeholder colour. */
export interface ImageSources {
  src: string;
  srcSet: string;
  color: string | null;
  width: number;
}

/** Latest upload attempt for an owner (members only, via RLS) — drives the upload status. */
export interface ImageUploadState {
  id: string;
  status: Database["public"]["Enums"]["audio_upload_status"];
  rejectionCode: string | null;
}

export async function imageSources(
  image: Pick<ImageRow, "variants" | "dominant_color" | "width"> | null,
  preferredWidth = 640,
): Promise<ImageSources | null> {
  const variants = (image?.variants ?? []) as { width: number; key: string }[];
  if (!image || !variants.length) return null;
  const signed = await Promise.all(
    variants.map(async (v) => ({ width: v.width, url: await presignImageGet(v.key) })),
  );
  const usable = signed.filter((v): v is { width: number; url: string } => Boolean(v.url));
  if (!usable.length) return null;
  const preferred = usable.find((v) => v.width >= preferredWidth) ?? usable[usable.length - 1]!;
  return {
    src: preferred.url,
    srcSet: usable.map((v) => `${v.url} ${v.width}w`).join(", "),
    color: image.dominant_color,
    width: image.width ?? preferred.width,
  };
}

/** Sources for an attached image by id (cover or artist photo), respecting RLS. */
export async function getImageSources(imageId: string | null, preferredWidth?: number) {
  if (!imageId) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("images")
    .select("variants, dominant_color, width, status")
    .eq("id", imageId)
    .maybeSingle();
  if (!data || data.status !== "accepted") return null;
  return imageSources(data, preferredWidth);
}

export async function getLatestImageUpload(
  kind: ImageKind,
  ownerId: string,
): Promise<ImageUploadState | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("images")
    .select("id, status, rejection_code")
    .eq("kind", kind)
    .eq(kind === "release_artwork" ? "release_id" : "artist_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, status: data.status, rejectionCode: data.rejection_code } : null;
}

/** Sources for many attached images in one query (lists, search results). */
export async function getImageSourcesMany(
  imageIds: (string | null)[],
  preferredWidth = 160,
): Promise<Map<string, ImageSources>> {
  const ids = [...new Set(imageIds.filter((id): id is string => Boolean(id)))];
  const result = new Map<string, ImageSources>();
  if (!ids.length) return result;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("images")
    .select("id, variants, dominant_color, width, status")
    .in("id", ids);
  for (const image of data ?? []) {
    if (image.status !== "accepted") continue;
    const sources = await imageSources(image, preferredWidth);
    if (sources) result.set(image.id, sources);
  }
  return result;
}
