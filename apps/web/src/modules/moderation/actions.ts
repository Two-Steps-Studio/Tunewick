"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DecisionState = {
  error?: "note_required" | "mfa_required" | "not_allowed" | "not_waiting" | "failed";
  note?: string;
};

/** Approve or return a submission. The database checks staff role, MFA and state again. */
export async function decide(
  releaseId: string,
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (decision === "return" && note.length < 10) return { error: "note_required", note };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_release", {
    release: releaseId,
    decision,
    note: decision === "return" ? note : undefined,
  });
  if (error) {
    if (error.hint === "mfa_required") return { error: "mfa_required", note };
    if (error.code === "42501") return { error: "not_allowed", note };
    if (error.code === "55000") return { error: "not_waiting", note };
    if (error.code === "22023") return { error: "note_required", note };
    return { error: "failed", note };
  }
  revalidatePath("/", "layout");
  return redirect({ href: "/moderation", locale: await getLocale() });
}
