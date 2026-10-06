import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { Database } from "@tunewick/shared";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request. Acts as the signed-in user, so RLS applies.
 */
export async function createSupabaseServerClient() {
  // cookies() first: it marks the route as dynamic, so builds never prerender user-specific
  // pages (and do not need Supabase configuration at build time).
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session on every
          // request, so a refresh attempted here is safe to ignore.
        }
      },
    },
  });
}
