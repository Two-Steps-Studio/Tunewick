import { isVoivodeship, type Voivodeship } from "@tunewick/shared";
import { z } from "zod";

export type ArtistErrorCode =
  | "nameRequired"
  | "nameTooLong"
  | "slugInvalid"
  | "slugTaken"
  | "slugReserved"
  | "bioTooLong"
  | "yearInvalid"
  | "voivodeshipInvalid"
  | "cityTooLong"
  | "countryInvalid"
  | "regionTooLong"
  | "languagesInvalid"
  | "genresTooMany"
  | "linksInvalid"
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
  voivodeship: z
    .string()
    .optional()
    .refine((v) => !v || isVoivodeship(v), { error: "voivodeshipInvalid" })
    .transform((v) => (v ? (v as Voivodeship) : null)),
  city: z
    .string()
    .trim()
    .max(80, { error: "cityTooLong" })
    .optional()
    .transform((v) => (v ? v : null)),
});

export const LINK_KINDS = [
  "website",
  "instagram",
  "tiktok",
  "youtube",
  "bandcamp",
  "soundcloud",
  "spotify",
  "x",
  "facebook",
  "other",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

const LINK_HOSTS: [RegExp, LinkKind][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)bandcamp\.com$/, "bandcamp"],
  [/(^|\.)soundcloud\.com$/, "soundcloud"],
  [/(^|\.)spotify\.com$/, "spotify"],
  [/(^|\.)(x\.com|twitter\.com)$/, "x"],
  [/(^|\.)facebook\.com$/, "facebook"],
];

/** What a link is, from its host ("https://odkrycie.bandcamp.com" → bandcamp). */
export function linkKind(url: string): LinkKind {
  const host = new URL(url).hostname.toLowerCase();
  return LINK_HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? "website";
}

/** Where the artist is from and what they make: country, region, languages, genres, links. */
export const artistReachSchema = z.object({
  country: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), { error: "countryInvalid" })
    .transform((v) => (v === "" ? null : v)),
  region: z
    .string()
    .trim()
    .max(80, { error: "regionTooLong" })
    .transform((v) => (v === "" ? null : v)),
  languages: z
    .string()
    .transform((v) => [
      ...new Set(
        v
          .toLowerCase()
          .split(/[\s,;]+/)
          .filter(Boolean),
      ),
    ])
    .refine((list) => list.length <= 8 && list.every((l) => /^[a-z]{2,3}$/.test(l)), {
      error: "languagesInvalid",
    }),
  genres: z.array(z.coerce.number().int().positive()).max(5, { error: "genresTooMany" }),
  links: z
    .string()
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .refine(
      (list) =>
        list.length <= 10 &&
        list.every(
          (url) => /^https:\/\/[^\s]+$/.test(url) && url.length <= 300 && URL.canParse(url),
        ),
      { error: "linksInvalid" },
    ),
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
