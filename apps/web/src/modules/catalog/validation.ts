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
  | "notEditable"
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
