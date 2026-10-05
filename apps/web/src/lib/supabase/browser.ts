"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@tunewick/shared";
import { supabaseConfig } from "./config";

/** Supabase client for Client Components. Only public configuration is used. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = supabaseConfig();
  return createBrowserClient<Database>(url, publishableKey);
}
