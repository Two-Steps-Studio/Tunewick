"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RedeemStatus =
  | "granted"
  | "invalid"
  | "inactive"
  | "expired"
  | "not_yet_valid"
  | "not_eligible"
  | "exhausted"
  | "already_redeemed"
  | "already_lifetime"
  | "unavailable"
  | "rate_limited";

export interface RedeemState {
  status?: RedeemStatus | "empty" | "unexpected";
  /** What the user typed, kept on failure (React resets the form after every action). */
  code?: string;
}

const STATUSES = new Set<string>([
  "granted",
  "invalid",
  "inactive",
  "expired",
  "not_yet_valid",
  "not_eligible",
  "exhausted",
  "already_redeemed",
  "already_lifetime",
  "unavailable",
  "rate_limited",
]);

/** Redeems a promo code: everything is decided by redeem_promo_code() in one transaction. */
export async function redeemCode(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const code = String(formData.get("code") ?? "")
    .trim()
    .slice(0, 64);
  if (!code) return { status: "empty" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("redeem_promo_code", { code });
  if (error) return { status: "unexpected", code };
  const status = (data as { status?: string } | null)?.status ?? "";
  if (!STATUSES.has(status)) return { status: "unexpected", code };
  if (status === "granted") {
    refresh();
    return { status };
  }
  return { status: status as RedeemStatus, code };
}
