import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in user, verified with the Auth server (getUser), or null.
 * Use for authorization decisions; never trust client-provided identity.
 */
export async function getOptionalUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** The signed-in user, or a redirect to `signInPath` when there is none. */
export async function requireUser(signInPath: string): Promise<User> {
  const user = await getOptionalUser();
  if (!user) redirect(signInPath);
  return user;
}

export interface MfaStatus {
  /** A verified TOTP factor exists. */
  enabled: boolean;
  /** This session passed the second factor (aal2). */
  verified: boolean;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createSupabaseServerClient();
  // Both from verified sources: listFactors reads the user from the Auth server, the level comes
  // from the signed access token (never from the unsigned user object in the cookie).
  const [{ data: factors }, { data: claims }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.getClaims(),
  ]);
  return {
    enabled: (factors?.totp.length ?? 0) > 0,
    verified: claims?.claims?.aal === "aal2",
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
