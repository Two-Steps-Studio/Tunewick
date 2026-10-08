import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const shareSchema = z.object({
  trackId: z.uuid(),
  channel: z.enum(["native", "copy", "card", "video"]),
});

/** A share of a public song: points (once per song and day) for signed-in listeners. */
export async function POST(request: NextRequest) {
  const parsed = shareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.json({ points: 0 });
  const { data, error } = await supabase.rpc("record_share", {
    track: parsed.data.trackId,
    channel: parsed.data.channel,
  });
  if (error) return new NextResponse(null, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ points: data ?? 0 });
}
