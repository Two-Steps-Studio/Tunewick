/** Option lists and formatting shared by forms and validation (no zod: safe to bundle). */

export const RELEASE_TYPES = ["single", "ep", "album", "compilation", "live"] as const;
export const AI_CONTENT = ["unknown", "human", "ai_assisted", "ai_generated"] as const;
/** What an artist may choose: music made by people, with or without AI tools (docs/product.md). */
export const AI_CHOICES = ["unknown", "human", "ai_assisted"] as const;
export const TERRITORIES = ["WORLD", "EU", "PL"] as const;
export const CREDIT_ROLES = [
  "producer",
  "songwriter",
  "composer",
  "lyricist",
  "performer",
  "mixing_engineer",
  "mastering_engineer",
  "other",
] as const;

/** "m:ss" for a soundcheck start in milliseconds. */
export function formatSoundcheckStart(ms: number | null) {
  if (ms === null) return "";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const ARTIST_TERMS_VERSION = "draft-2026-10";
export const CMO_OPTIONS = [
  "zaiks",
  "stoart",
  "sawp",
  "zpav",
  "other_cmo",
  "none",
  "unknown",
] as const;
