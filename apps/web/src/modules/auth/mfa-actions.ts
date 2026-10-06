"use server";

import { redirect as redirectToPath } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "./validation";

export type MfaErrorCode = "codeInvalid" | "codeFormat" | "rateLimited" | "unexpected";

export interface EnrollState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
  error?: MfaErrorCode;
}

export interface VerifyState {
  error?: MfaErrorCode;
}

const CODE = /^\d{6}$/;

function mfaError(error: { code?: string; status?: number }): MfaErrorCode {
  if (error.status === 429 || error.code?.startsWith("over_")) return "rateLimited";
  if (error.code === "mfa_verification_failed" || error.code === "mfa_challenge_expired") {
    return "codeInvalid";
  }
  return "unexpected";
}

/** Starts TOTP enrollment and returns the QR code and manual key to show once. */
export async function startTotpEnrollment(): Promise<EnrollState> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();

  // Abandoned, never-verified factors would block a fresh enrollment.
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Tunewick",
    issuer: "Tunewick",
  });
  if (error || !data) return { error: error ? mfaError(error) : "unexpected" };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms enrollment with the first code; the session becomes aal2. */
export async function confirmTotpEnrollment(
  prev: EnrollState,
  formData: FormData,
): Promise<EnrollState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!prev.factorId) return { error: "unexpected" };
  if (!CODE.test(code)) return { ...prev, error: "codeFormat" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: prev.factorId, code });
  if (error) return { ...prev, error: mfaError(error) };

  return redirect({ href: "/settings/security", locale: await getLocale() });
}

/** Second step of sign-in for accounts with a verified factor. */
export async function verifySignIn(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE.test(code)) return { error: "codeFormat" };

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) return { error: "unexpected" };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: mfaError(error) };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (next) redirectToPath(next);
  return redirect({ href: "/", locale: await getLocale() });
}

/** Removing the factor requires an aal2 session (enforced by Supabase Auth as well). */
export async function disableTotp(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.totp ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  redirect({ href: "/settings/security", locale: await getLocale() });
}
