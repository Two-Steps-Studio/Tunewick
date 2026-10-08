import { z } from "zod";

export type ReleaseErrorCode =
  | "titleRequired"
  | "titleTooLong"
  | "slugInvalid"
  | "slugTaken"
  | "dateInvalid"
  | "upcInvalid"
  | "lineTooLong"
  | "isrcInvalid"
  | "nameRequired"
  | "tooManyGenres"
  | "masterRequired"
  | "cmoRequired"
  | "cmoNoneExclusive"
  | "samplesDescriptionRequired"
  | "aiRequired"
  | "termsRequired"
  | "notEditable"
  | "previewTime"
  | "previewOutside"
  | "forbidden"
  | "unexpected";

export interface ReleaseFormState {
  saved?: boolean;
  error?: ReleaseErrorCode;
  fieldErrors?: Partial<Record<string, ReleaseErrorCode>>;
  values?: Record<string, string>;
}

export const RELEASE_TYPES = ["single", "ep", "album", "compilation", "live"] as const;
export const AI_CONTENT = ["unknown", "human", "ai_assisted", "ai_generated"] as const;
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

const optional = (schema: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(schema.nullable());

const title = z
  .string()
  .trim()
  .min(1, { error: "titleRequired" })
  .max(200, { error: "titleTooLong" });

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,80}$/, { error: "slugInvalid" });

export const newReleaseSchema = z.object({
  title,
  slug,
  type: z.enum(RELEASE_TYPES),
});

export const releaseDetailsSchema = z.object({
  title,
  slug,
  type: z.enum(RELEASE_TYPES),
  releaseDate: optional(z.iso.date({ error: "dateInvalid" })),
  explicit: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
  aiContent: z.enum(AI_CONTENT),
  territory: z.enum(TERRITORIES),
  upc: optional(z.string().regex(/^[0-9]{12,13}$/, { error: "upcInvalid" })),
  pLine: optional(z.string().max(200, { error: "lineTooLong" })),
  cLine: optional(z.string().max(200, { error: "lineTooLong" })),
});

export const trackSchema = z.object({
  title,
  isrc: optional(
    z
      .string()
      .toUpperCase()
      .regex(/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/, { error: "isrcInvalid" }),
  ),
  explicit: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
  aiContent: z.enum(AI_CONTENT),
});

export const creditSchema = z.object({
  name: z.string().trim().min(1, { error: "nameRequired" }).max(120, { error: "nameRequired" }),
  role: z.enum(CREDIT_ROLES),
  detail: optional(z.string().max(120, { error: "lineTooLong" })),
});

export const genresSchema = z
  .array(z.coerce.number().int().positive())
  .max(3, { error: "tooManyGenres" });

/** Artist terms version recorded with each declaration (draft until the legal review). */
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

/** Rights declaration (docs/licensing.md §3); mirrors the database constraints. */
export const rightsSchema = z
  .object({
    ownsMaster: z.literal("on", { error: "masterRequired" }),
    controlsComposition: z
      .literal("on")
      .optional()
      .transform((v) => v === "on"),
    cmo: z
      .array(z.enum(CMO_OPTIONS))
      .min(1, { error: "cmoRequired" })
      .refine((a) => !a.includes("none") || a.length === 1, { error: "cmoNoneExclusive" }),
    samples: z.enum(["none", "cleared"]),
    samplesDescription: z.string().trim().max(2000),
    aiContent: z.enum(["human", "ai_assisted", "ai_generated"], { error: "aiRequired" }),
    acceptTerms: z.literal("on", { error: "termsRequired" }),
  })
  .refine((v) => v.samples === "none" || v.samplesDescription.length > 0, {
    error: "samplesDescriptionRequired",
    path: ["samplesDescription"],
  });

/** First error code per field. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const result: Record<string, ReleaseErrorCode> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !result[key]) result[key] = issue.message as ReleaseErrorCode;
  }
  return result;
}

/** Maps database errors to user-facing codes. */
export function releaseDbError(error: { code?: string; message?: string }): ReleaseFormState {
  const message = error.message ?? "";
  if (error.code === "23505") return { fieldErrors: { slug: "slugTaken" } };
  if (error.code === "23514" && message.includes("genres")) return { error: "tooManyGenres" };
  if (error.code === "23514" && message.includes("isrc"))
    return { fieldErrors: { isrc: "isrcInvalid" } };
  if (error.code === "42501") return { error: "forbidden" };
  return { error: "unexpected" };
}

/** "1:05" or "65" → 65 000 ms; null for anything else. */
export function parseClock(value: string): number | null {
  const match = value.trim().match(/^(?:(\d{1,3}):)?(\d{1,2})$/);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2]);
  if (match[1] !== undefined && seconds > 59) return null;
  return (minutes * 60 + seconds) * 1000;
}

export function formatClock(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const PREVIEW_LENGTHS = [15, 20, 25, 30] as const;

/** The Discover preview: automatic (empty start) or a start time + 15–30 s inside the track. */
export const previewSchema = z
  .object({
    start: z.string(),
    length: z.coerce.number().refine((v) => (PREVIEW_LENGTHS as readonly number[]).includes(v)),
    durationMs: z.number().int().positive().nullable(),
  })
  .transform((v, ctx) => {
    if (v.start.trim() === "") return { startMs: null, lengthMs: null };
    const startMs = parseClock(v.start);
    if (startMs === null) {
      ctx.addIssue({ code: "custom", path: ["start"], message: "previewTime" });
      return z.NEVER;
    }
    const lengthMs = v.length * 1000;
    if (v.durationMs !== null && startMs + lengthMs > v.durationMs) {
      ctx.addIssue({ code: "custom", path: ["start"], message: "previewOutside" });
      return z.NEVER;
    }
    return { startMs, lengthMs };
  });
