"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Follow / unfollow a person. Returns the state the database now has. */
export async function setUserFollow(personId: string, on: boolean) {
  if (!z.uuid().safeParse(personId).success) return { ok: false as const, on: !on };
  const supabase = await createSupabaseServerClient();
  const { error } = on
    ? await supabase.from("user_follows").insert({ followee_id: personId })
    : await supabase.from("user_follows").delete().eq("followee_id", personId);
  if (error && error.code !== "23505") return { ok: false as const, on: !on };
  return { ok: true as const, on };
}
