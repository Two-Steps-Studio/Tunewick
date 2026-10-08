"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const id = z.uuid();

/**
 * Follows or unfollows a person (idempotent). Returns the state the database now has; a block
 * on either side makes following fail, and the button then shows the real state.
 */
export async function setFollow(profileId: string, on: boolean) {
  const parsed = id.safeParse(profileId);
  if (!parsed.success) return { ok: false as const, on: !on };
  const supabase = await createSupabaseServerClient();
  const { error } = on
    ? await supabase.from("user_follows").insert({ followee_id: parsed.data })
    : await supabase.from("user_follows").delete().eq("followee_id", parsed.data);
  if (error && error.code !== "23505") return { ok: false as const, on: !on };
  refresh();
  return { ok: true as const, on };
}

/** Blocks or unblocks a person. Blocking ends follows both ways (database trigger). */
export async function setBlock(profileId: string, on: boolean) {
  const parsed = id.safeParse(profileId);
  if (!parsed.success) throw new Error("invalid profile");
  const supabase = await createSupabaseServerClient();
  const { error } = on
    ? await supabase.from("user_blocks").insert({ blocked_id: parsed.data })
    : await supabase.from("user_blocks").delete().eq("blocked_id", parsed.data);
  if (error && error.code !== "23505") throw error;
  refresh();
}
