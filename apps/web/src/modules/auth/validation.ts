import { z } from "zod";

/** Error codes map to messages under Auth.errors.* in messages/{pl,en}.json. */
export type AuthErrorCode =
  | "invalidEmail"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordRequired"
  | "passwordMismatch"
  | "displayNameTooLong"
  | "ageRequired"
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "weakPassword"
  | "samePassword"
  | "rateLimited"
  | "linkInvalid"
  | "unexpected";

export type AuthField = "email" | "password" | "confirmPassword" | "displayName" | "ageConfirmed";

export interface AuthFormState {
  error?: AuthErrorCode;
  fieldErrors?: Partial<Record<AuthField, AuthErrorCode>>;
  /** Values echoed back so the form keeps them after a failed submit (never passwords). */
  values?: { email?: string; displayName?: string };
}

export const PASSWORD_MIN = 10;
// bcrypt (used by Supabase Auth) only considers the first 72 bytes.
export const PASSWORD_MAX = 72;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "invalidEmail" }));

const newPassword = z
  .string()
  .min(PASSWORD_MIN, { error: "passwordTooShort" })
  .max(PASSWORD_MAX, { error: "passwordTooLong" });

export const signUpSchema = z.object({
  email,
  password: newPassword,
  displayName: z
    .string()
    .trim()
    .max(80, { error: "displayNameTooLong" })
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  ageConfirmed: z.literal("on", { error: "ageRequired" }),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "passwordRequired" }),
});

export const resetRequestSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    error: "passwordMismatch",
    path: ["confirmPassword"],
  });

/** Reads named fields from FormData (missing fields become undefined). */
export function formFields(formData: FormData, names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : undefined];
    }),
  );
}

/** First error code per field from a failed zod parse. */
export function fieldErrorsFrom(error: z.ZodError): AuthFormState["fieldErrors"] {
  const result: Partial<Record<AuthField, AuthErrorCode>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as AuthField | undefined;
    if (field && !result[field]) result[field] = issue.message as AuthErrorCode;
  }
  return result;
}

/** Only same-site, absolute paths are allowed as post-login destinations. */
export function safeNextPath(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

/** Maps Supabase Auth errors to user-facing codes without leaking account existence. */
export function authErrorCode(error: { code?: string; status?: number }): AuthErrorCode {
  if (error.status === 429 || error.code?.startsWith("over_")) return "rateLimited";
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "otp_expired":
    case "flow_state_expired":
    case "bad_jwt":
      return "linkInvalid";
    default:
      return "unexpected";
  }
}
