import { z } from "zod";

export type ArtistErrorCode =
  | "nameRequired"
  | "nameTooLong"
  | "slugInvalid"
  | "slugTaken"
  | "slugReserved"
  | "bioTooLong"
  | "yearInvalid"
  | "handleNotFound"
  | "evidenceRequired"
  | "evidenceInvalid"
  | "alreadyPending"
  | "lastOwner"
  | "forbidden"
  | "unexpected";

export interface ArtistFormState {
  saved?: boolean;
  error?: ArtistErrorCode;
  fieldErrors?: Partial<Record<string, ArtistErrorCode>>;
  values?: Record<string, string>;
}

const name = z.string().trim().min(1, { error: "nameRequired" }).max(120, { error: "nameTooLong" });

export { slugify } from "@/lib/slug";

export const createArtistSchema = z.object({
  name,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, { error: "slugInvalid" }),
});

export const updateArtistSchema = z.object({
  name,
  bio: z
    .string()
    .trim()
    .max(2000, { error: "bioTooLong" })
    .transform((v) => (v === "" ? null : v)),
  formedYear: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2100), {
      error: "yearInvalid",
    })
    .transform((v) => (v === "" ? null : Number(v))),
});

export const inviteSchema = z.object({
  handle: z.string().trim().toLowerCase().min(2, { error: "handleNotFound" }),
  role: z.enum(["owner", "manager", "member"]),
});

/** One https link per line, 1–5 links. */
export const verificationSchema = z.object({
  evidence: z
    .string()
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.url({ protocol: /^https$/, error: "evidenceInvalid" }))
        .min(1, { error: "evidenceRequired" })
        .max(5, { error: "evidenceInvalid" }),
    ),
  note: z
    .string()
    .trim()
    .max(2000, { error: "evidenceInvalid" })
    .transform((v) => (v === "" ? null : v)),
});

/** Maps database errors from artist operations to user-facing codes. */
export function artistDbError(error: { code?: string; message?: string }): {
  field?: string;
  code: ArtistErrorCode;
} {
  const message = error.message ?? "";
  if (error.code === "23505" && message.includes("verification")) return { code: "alreadyPending" };
  if (error.code === "23505") return { field: "slug", code: "slugTaken" };
  if (error.code === "23514" && message.includes("slug_not_reserved")) {
    return { field: "slug", code: "slugReserved" };
  }
  if (error.code === "23514" && message.includes("slug_format")) {
    return { field: "slug", code: "slugInvalid" };
  }
  if (error.code === "23514" && message.includes("owner")) return { code: "lastOwner" };
  if (error.code === "P0002") return { field: "handle", code: "handleNotFound" };
  if (error.code === "42501") return { code: "forbidden" };
  return { code: "unexpected" };
}
