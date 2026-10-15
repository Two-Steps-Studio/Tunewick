"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Remind me (on) / never mind (off). Returns the state the database now has. */
export async function setReminder(releaseId: string, on: boolean) {
  if (!z.uuid().safeParse(releaseId).success) return { ok: false as const, on: !on };
  const supabase = await createSupabaseServerClient();
  const { error } = on
    ? await supabase.from("release_reminders").insert({ release_id: releaseId })
    : await supabase.from("release_reminders").delete().eq("release_id", releaseId);
  if (error && error.code !== "23505") return { ok: false as const, on: !on };
  return { ok: true as const, on };
}
