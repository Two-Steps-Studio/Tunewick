import { z } from "zod";

export type SettingsErrorCode =
  | "handleInvalid"
  | "handleReserved"
  | "handleTaken"
  | "displayNameTooLong"
  | "bioTooLong"
  | "unexpected";

export type SettingsField = "handle" | "displayName" | "bio";

export interface SettingsFormState {
  saved?: boolean;
  error?: SettingsErrorCode;
  fieldErrors?: Partial<Record<SettingsField, SettingsErrorCode>>;
}

const optionalText = (max: number, error: SettingsErrorCode) =>
  z
    .string()
    .trim()
    .max(max, { error })
    .transform((v) => (v === "" ? null : v));

/** Mirrors the database constraints (profiles_handle_format, lengths). */
export const settingsSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9-]{2,40}$/, { error: "handleInvalid" })
        .nullable(),
    ),
  displayName: optionalText(80, "displayNameTooLong"),
  bio: optionalText(500, "bioTooLong"),
  locale: z.enum(["pl", "en"]),
  activityVisibility: z.enum(["public", "followers", "private"]),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

/** Maps Postgres errors from the profile update to field errors. */
export function profileErrorField(error: {
  code?: string;
  message?: string;
}): SettingsFormState["fieldErrors"] | null {
  if (error.code === "23505") return { handle: "handleTaken" };
  if (error.code === "23514") {
    if (error.message?.includes("profiles_handle_not_reserved"))
      return { handle: "handleReserved" };
    if (error.message?.includes("profiles_handle_format")) return { handle: "handleInvalid" };
    if (error.message?.includes("display_name")) return { displayName: "displayNameTooLong" };
    if (error.message?.includes("bio")) return { bio: "bioTooLong" };
  }
  return null;
}
