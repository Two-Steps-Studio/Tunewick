import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tunewick/shared";
import { unstable_cache } from "next/cache";
import { supabaseConfig } from "./config";

/**
 * Supabase client without a session: reads exactly what any visitor may read. For data that is
 * the same for everyone (charts, the music map), so the result can be shared between requests.
 */
export function createSupabasePublicClient() {
  const { url, publishableKey } = supabaseConfig();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * A query shared by every visitor, cached across requests for `seconds` (stale results are
 * served while one refresh runs). Only for data that doesn't depend on who is asking: the
 * function gets a session-less client. Arguments are part of the cache key.
 */
export function publicQuery<Args extends unknown[], Result>(
  key: string,
  seconds: number,
  query: (
    supabase: ReturnType<typeof createSupabasePublicClient>,
    ...args: Args
  ) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return unstable_cache((...args: Args) => query(createSupabasePublicClient(), ...args), [key], {
    revalidate: seconds,
    tags: [key],
  });
}
