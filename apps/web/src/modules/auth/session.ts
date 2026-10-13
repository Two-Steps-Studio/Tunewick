import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user, verified with the Auth server (getUser), or null.
 * Use for authorization decisions; never trust client-provided identity.
 */
export const getOptionalUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** The signed-in user, or a redirect to `signInPath` when there is none. */
export async function requireUser(signInPath: string): Promise<User> {
  const user = await getOptionalUser();
  if (!user) redirect(signInPath);
  return user;
}

export interface MfaStatus {
  /** At least one verified second factor exists (authenticator app or passkey). */
  enabled: boolean;
  /** This session passed the second factor (aal2). */
  verified: boolean;
  /** A verified authenticator-app (TOTP) factor exists. */
  totp: boolean;
  /** Verified passkeys (WebAuthn): fingerprint, face or device PIN - no extra app. */
  passkeys: { id: string; name: string | null; createdAt: string }[];
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createSupabaseServerClient();
  // Both from verified sources: listFactors reads the user from the Auth server, the level comes
  // from the signed access token (never from the unsigned user object in the cookie).
  const [{ data: factors }, { data: claims }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.getClaims(),
  ]);
  const verified = (factors?.all ?? []).filter((factor) => factor.status === "verified");
  return {
    enabled: verified.length > 0,
    verified: claims?.claims?.aal === "aal2",
    totp: verified.some((factor) => factor.factor_type === "totp"),
    passkeys: verified
      .filter((factor) => factor.factor_type === "webauthn")
      .map((factor) => ({
        id: factor.id,
        name: factor.friendly_name ?? null,
        createdAt: factor.created_at,
      })),
  };
}

/**
 * Staff pages: the role is checked with the database and the session must be aal2.
 * Staff without a second factor are sent to set one up (docs/security.md §2).
 * Database functions enforce the same rule independently (public.require_staff).
 */
export async function requireStaff(
  role: "moderator" | "admin",
  paths: { signIn: string; security: string; forbidden: string },
): Promise<User> {
  const user = await requireUser(paths.signIn);
  const supabase = await createSupabaseServerClient();
  // Admins can do everything moderators can (same rule as public.is_staff()).
  const { data: hasRole } =
    role === "moderator"
      ? await supabase.rpc("is_staff")
      : await supabase.rpc("has_app_role", { required: role });
  if (!hasRole) redirect(paths.forbidden);
  const mfa = await getMfaStatus();
  if (!mfa.enabled || !mfa.verified) redirect(paths.security);
  return user;
}

/** Whether the signed-in user has a staff role (moderator or admin). Not an authorization check. */
export async function isStaff(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("is_staff");
  return data === true;
}

/** Whether the signed-in user is an admin. Not an authorization check (the database decides). */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("has_app_role", { required: "admin" });
  return data === true;
}
