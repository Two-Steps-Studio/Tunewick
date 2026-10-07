import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// One listen from the player (ListeningTracker) or a Discover preview. The database decides
// whether it is plausible (public track, time within the track, recent start, rate limit) and
// what it earns — this only shapes the input and passes the awards back.
const listenSchema = z.object({
  trackId: z.uuid(),
  startedAt: z.iso.datetime(),
  msPlayed: z.number().int().min(1000).max(21_600_000),
  completed: z.boolean(),
  tier: z.enum(["data_saver", "high", "lossless", "hires"]).nullable(),
  context: z.enum(["player", "preview"]).default("player"),
});

export async function POST(request: NextRequest) {
  const parsed = listenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_listen", {
    track: parsed.data.trackId,
    started_at: parsed.data.startedAt,
    ms_played: parsed.data.msPlayed,
    completed: parsed.data.completed,
    tier: parsed.data.tier ?? undefined,
    context: parsed.data.context,
  });
  if (!error) return NextResponse.json(data);
  if (error.code === "42501") return new NextResponse(null, { status: 403 });
  if (error.code === "22023") return new NextResponse(null, { status: 422 });
  if (error.code === "54000") return new NextResponse(null, { status: 429 });
  return new NextResponse(null, { status: 500 });
}
