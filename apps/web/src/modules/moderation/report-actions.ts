"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Staff decision on a report (the database checks role and MFA, and audits it). */
export async function decideReport(reportId: string, decision: "actioned" | "dismissed") {
  if (!z.uuid().safeParse(reportId).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("decide_report", { report: reportId, decision });
  refresh();
}
