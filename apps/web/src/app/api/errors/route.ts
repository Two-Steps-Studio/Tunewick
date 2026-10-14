import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Browser errors (reportClientError). The database groups and caps them (report_error).
const reportSchema = z.object({
  message: z.string().max(2000),
  detail: z.string().max(8000).optional(),
  path: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("report_error", {
    source: "client",
    message: parsed.data.message,
    detail: parsed.data.detail,
    path: parsed.data.path,
  });
  return new NextResponse(null, { status: 204 });
}
