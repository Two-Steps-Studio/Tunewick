import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAutoplayTracks } from "@/modules/discover";

// Autoplay for the player: songs like the last one in the queue. A route, not a server action:
// actions from one page run one after another, and this one must not hold up a like or a save.
const autoplaySchema = z.object({
  trackId: z.uuid(),
  exclude: z.array(z.uuid()).max(500),
});

export async function POST(request: NextRequest) {
  const parsed = autoplaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  try {
    const tracks = await getAutoplayTracks(parsed.data.trackId, parsed.data.exclude);
    // Signed preview URLs inside: never cached, never shared.
    return NextResponse.json({ tracks }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ tracks: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
