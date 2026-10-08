import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Playback telemetry from PlaybackMetrics: no user id is stored, only what the budget needs.
const metricSchema = z.object({
  outcome: z.enum(["started", "error"]),
  tier: z.enum(["data_saver", "high", "lossless", "hires"]).nullable(),
  strategy: z.enum(["mse", "native"]).nullable(),
  browser: z.enum(["chrome", "firefox", "safari", "edge", "other"]),
  firstAudioMs: z.number().int().min(0).max(120_000).nullable(),
  errorCode: z.enum(["media_error", "stream_error", "playback_blocked", "unplayable"]).nullable(),
});

export async function POST(request: NextRequest) {
  const parsed = metricSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const m = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("report_playback", {
    outcome: m.outcome,
    tier: m.tier ?? undefined,
    strategy: m.strategy ?? undefined,
    browser: m.browser,
    first_audio_ms: m.firstAudioMs ?? undefined,
    error_code: m.errorCode ?? undefined,
  });
  if (!error) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: error.code === "42501" ? 403 : 422 });
}
