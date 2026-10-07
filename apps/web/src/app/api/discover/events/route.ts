import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EVENT_NAMES = [
  "song_impression",
  "preview_started",
  "preview_completed",
  "song_played",
  "song_skipped",
  "song_liked",
  "song_saved",
  "artist_followed",
  "artist_opened",
  "search",
  "recommendation_clicked",
  "discovery_completed",
  "goal_completed",
  "achievement_unlocked",
  "ranking_viewed",
  "weekly_recap_viewed",
  "onboarding_completed",
] as const;

const eventsSchema = z.object({
  events: z
    .array(
      z.object({
        name: z.enum(EVENT_NAMES),
        track: z.uuid().optional(),
        artist: z.uuid().optional(),
        mode: z.string().max(20).optional(),
        position: z.number().int().min(0).max(9999).optional(),
        reason: z.string().max(40).optional(),
        ms: z.number().int().min(0).max(21_600_000).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Product events from the feed, batched. Only signed-in listeners' events are stored (no IP, no
 * user agent); visitors' events are accepted and dropped, so the client needs no special case.
 */
export async function POST(request: NextRequest) {
  const parsed = eventsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new NextResponse(null, { status: 204 });
  const { error } = await supabase.rpc("record_events", { events: parsed.data.events });
  return new NextResponse(null, { status: error ? 500 : 204 });
}
