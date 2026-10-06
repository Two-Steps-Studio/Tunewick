/** Client/server checks for images (the database and the worker check again, by decoding). */

export type ImageKind = "release_artwork" | "artist_image";

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const MIN_IMAGE_BYTES = 1024;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export type ImageUploadError =
  | "unsupported_type"
  | "too_large"
  | "too_small"
  | "too_many"
  | "not_allowed"
  | "unavailable"
  | "incomplete"
  | "transfer"
  | "failed";

export function imageExtension(fileName: string) {
  return (
    fileName
      .trim()
      .match(/\.([A-Za-z0-9]{2,5})$/)?.[1]
      ?.toLowerCase() ?? null
  );
}

export function checkImageFile(fileName: string, sizeBytes: number): ImageUploadError | null {
  const extension = imageExtension(fileName);
  if (!extension || !IMAGE_EXTENSIONS.includes(extension)) return "unsupported_type";
  if (!Number.isInteger(sizeBytes) || sizeBytes < MIN_IMAGE_BYTES) return "too_small";
  if (sizeBytes > MAX_IMAGE_BYTES) return "too_large";
  return null;
}
