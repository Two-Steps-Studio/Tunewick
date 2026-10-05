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
