import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const AUDIT_FILTERS = [
  "moderation.",
  "artist.",
  "promo.",
  "entitlement.",
  "role.",
  "feature_flag.",
] as const;
export type AuditFilter = (typeof AUDIT_FILTERS)[number];

/** Everything the admin page shows (admin + aal2 — the database checks again). */
export async function getAdminOverview(filter: AuditFilter | null) {
  const supabase = await createSupabaseServerClient();
  // The last closed month (the monthly job closes it on the 2nd).
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
  const [staff, flags, audit, playback, shares] = await Promise.all([
    supabase.rpc("admin_list_staff"),
    supabase.rpc("admin_list_feature_flags"),
    supabase.rpc("admin_audit_log", {
      max_results: 100,
      action_prefix: filter ?? undefined,
    }),
    supabase.rpc("admin_playback_summary", { days: 7 }),
    supabase.rpc("admin_listening_shares", { month: lastMonth }),
  ]);
  if (staff.error) throw staff.error;
  if (flags.error) throw flags.error;
  if (audit.error) throw audit.error;
  if (playback.error) throw playback.error;
  if (shares.error) throw shares.error;
  return {
    staff: staff.data,
    flags: flags.data,
    audit: audit.data,
    playback: playback.data,
    shares: { month: lastMonth, rows: shares.data },
  };
}
