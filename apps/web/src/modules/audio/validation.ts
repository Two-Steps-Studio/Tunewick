/** Shared client/server checks for master files (the database and the worker check again). */

export const MASTER_EXTENSIONS = [
  "wav",
  "wave",
  "bwf",
  "rf64",
  "aif",
  "aiff",
  "aifc",
  "flac",
  "m4a",
];
export const MASTER_ACCEPT = MASTER_EXTENSIONS.map((ext) => `.${ext}`).join(",");
export const MIN_MASTER_BYTES = 1024;
export const MAX_MASTER_BYTES = 4 * 1024 ** 3;

export type UploadError =
  | "unsupported_type"
  | "too_large"
  | "too_small"
  | "too_many"
  | "not_allowed"
  | "unavailable"
  | "incomplete"
  | "transfer"
  | "failed";

export function checkMasterFile(fileName: string, sizeBytes: number): UploadError | null {
  const extension = fileName
    .trim()
    .match(/\.([A-Za-z0-9]{2,5})$/)?.[1]
    ?.toLowerCase();
  if (!extension || !MASTER_EXTENSIONS.includes(extension)) return "unsupported_type";
  if (!Number.isInteger(sizeBytes) || sizeBytes < MIN_MASTER_BYTES) return "too_small";
  if (sizeBytes > MAX_MASTER_BYTES) return "too_large";
  return null;
}
