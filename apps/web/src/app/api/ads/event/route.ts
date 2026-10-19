import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Anonymous ad counts (AdBeacon). The database ignores campaigns that are not running.
const eventSchema = z.object({
  id: z.string().uuid(),
  placement: z.enum(["library", "charts", "browse", "scene"]),
  kind: z.enum(["impression", "click"]),
});

export async function POST(request: NextRequest) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("record_ad_event", {
    campaign: parsed.data.id,
    placement: parsed.data.placement,
    kind: parsed.data.kind,
  });
  return new NextResponse(null, { status: 204 });
}
