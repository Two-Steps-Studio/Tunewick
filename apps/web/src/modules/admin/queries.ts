import "server-only";

import { SCHEMA_VERSION } from "@/lib/schema-version";
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

interface MediaQueue {
  waiting: number;
  processing: number;
  oldest_waiting_at: string | null;
}

/** File processing (the audio worker): queues and the latest errors it reported. */
export interface MediaHealth {
  audio: MediaQueue;
  images: MediaQueue;
  errors_24h: number;
  recent_errors: { kind: "audio" | "image" | "clip" | "reanalysis"; message: string; at: string }[];
  /** Something has waited longer than STUCK_MS: the worker is down or cannot reach the database. */
  stuck: boolean;
}

const STUCK_MS = 10 * 60 * 1000;

/** Everything the admin page shows (admin + aal2 - the database checks again). */
export async function getAdminOverview(filter: AuditFilter | null) {
  const supabase = await createSupabaseServerClient();
  // The last closed month (the monthly job closes it on the 2nd).
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
  const [staff, flags, audit, playback, shares, media, schema] = await Promise.all([
    supabase.rpc("admin_list_staff"),
    supabase.rpc("admin_list_feature_flags"),
    supabase.rpc("admin_audit_log", {
      max_results: 100,
      action_prefix: filter ?? undefined,
    }),
    supabase.rpc("admin_playback_summary", { days: 7 }),
    supabase.rpc("admin_listening_shares", { month: lastMonth }),
    supabase.rpc("admin_media_health"),
    supabase.rpc("admin_schema_version"),
  ]);
  if (staff.error) throw staff.error;
  if (flags.error) throw flags.error;
  if (audit.error) throw audit.error;
  if (playback.error) throw playback.error;
  if (shares.error) throw shares.error;
  return {
    // These two depend on the newest migrations: without them the rest of the panel still works
    // and says the database is behind.
    media: media.error ? null : withStuck(media.data as unknown as Omit<MediaHealth, "stuck">),
    databaseBehind: schema.error || !schema.data || schema.data < SCHEMA_VERSION,
    staff: staff.data,
    flags: flags.data,
    audit: audit.data,
    playback: playback.data,
    shares: { month: lastMonth, rows: shares.data },
  };
}

function withStuck(health: Omit<MediaHealth, "stuck">): MediaHealth {
  const now = Date.now();
  const stuck = [health.audio, health.images].some(
    (q) => q.oldest_waiting_at !== null && now - Date.parse(q.oldest_waiting_at) > STUCK_MS,
  );
  return { ...health, stuck };
}
