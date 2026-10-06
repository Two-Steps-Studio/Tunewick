"use server";

import { redirect as redirectToPath } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { StaticPathname } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isFeatureEnabled } from "@/modules/flags";
import {
  type AuthFormState,
  authErrorCode,
  fieldErrorsFrom,
  formFields,
  resetRequestSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./validation";

/**
 * Errors that only an existing account can trigger. Reporting them would reveal that the
 * address is registered, so callers treat them like success.
 */
function revealsAccountExistence(error: { code?: string }) {
  return error.code === "user_already_exists" || error.code === "over_email_send_rate_limit";
}

async function go(
  href: StaticPathname | { pathname: StaticPathname; query?: Record<string, string> },
) {
  const locale = await getLocale();
  return redirect({ href, locale });
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formFields(formData, [
    "email",
    "password",
    "displayName",
    "ageConfirmed",
    "inviteCode",
  ]);
  const parsed = signUpSchema.safeParse(raw);
  const values = { email: raw.email, displayName: raw.displayName, inviteCode: raw.inviteCode };
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createSupabaseServerClient();

  // Closed beta: friendly check first. The real gate is the database trigger on auth.users
  // (private.enforce_access_invite), which also covers direct calls to the Auth API.
  const closedBeta = await isFeatureEnabled("closed_beta");
  const inviteCode = parsed.data.inviteCode;
  if (closedBeta) {
    if (!inviteCode) return { fieldErrors: { inviteCode: "inviteRequired" }, values };
    const { data: valid } = await supabase.rpc("access_invite_is_valid", { code: inviteCode });
    if (!valid) return { fieldErrors: { inviteCode: "inviteInvalid" }, values };
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Only whitelisted keys are read by the signup triggers; invite_code is removed there.
      data: {
        display_name: parsed.data.displayName ?? null,
        locale: await getLocale(),
        age_confirmed: "true",
        ...(closedBeta ? { invite_code: inviteCode } : {}),
      },
    },
  });

  // An existing address must look exactly like a new one (no account enumeration):
  // "already exists" and the per-address resend limit (only hit by addresses that already
  // received an email) both end on the same check-email page as a successful sign-up.
  if (error && !revealsAccountExistence(error)) {
    const code = authErrorCode(error);
    if (code === "weakPassword") return { fieldErrors: { password: code }, values };
    if (code === "rateLimited") return { error: code, values };
    // The invite can be used up between the check and the insert (trigger rejects it).
    if (closedBeta) return { fieldErrors: { inviteCode: "inviteInvalid" }, values };
    return { error: "unexpected", values };
  }

  return go({ pathname: "/check-email", query: { reason: "signup" } });
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formFields(formData, ["email", "password", "next"]);
  const parsed = signInSchema.safeParse(raw);
  const values = { email: raw.email };
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorCode(error), values };

  const next = safeNextPath(raw.next);

  // Accounts with an authenticator app continue with the second step. (A redirect from a server
  // action renders without passing the proxy again, so the proxy's aal2 gate is not enough here.)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return go({ pathname: "/verify", query: next ? { next } : undefined });
  }

  // `next` is an already-localized, same-site path produced by our own links.
  if (next) redirectToPath(next);
  return go("/");
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = formFields(formData, ["email"]);
  const parsed = resetRequestSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values: raw };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  // Same response whether or not the account exists; only IP-wide rate limits are reported.
  if (error && !revealsAccountExistence(error) && authErrorCode(error) === "rateLimited") {
    return { error: "rateLimited", values: raw };
  }

  return go({ pathname: "/check-email", query: { reason: "reset" } });
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse(
    formFields(formData, ["password", "confirmPassword"]),
  );
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "linkInvalid" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const code = authErrorCode(error);
    return code === "weakPassword" || code === "samePassword"
      ? { fieldErrors: { password: code } }
      : { error: code };
  }

  // A password change ends every other session (docs/security.md §2).
  await supabase.auth.signOut({ scope: "others" });
  return go("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await go("/");
}
