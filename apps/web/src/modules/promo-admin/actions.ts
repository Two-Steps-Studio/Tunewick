"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  benefitValue,
  campaignSchema,
  endOfDayInPoland,
  generateSchema,
  sharedSchema,
} from "./validation";

export type PromoAdminError =
  "invalid" | "duplicate" | "mfa_required" | "not_allowed" | "not_found" | "failed";

export interface PromoFormState {
  error?: PromoAdminError;
  /** What was submitted, kept on failure (React resets forms after every action). */
  values?: Record<string, string>;
  /** Generated codes — returned once, never stored in plaintext. */
  codes?: string[];
  done?: boolean;
}

function read(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "")]));
}

function mapError(error: { code?: string; hint?: string }): PromoAdminError {
  if (error.hint === "mfa_required") return "mfa_required";
  if (error.code === "42501") return "not_allowed";
  if (error.code === "23505") return "duplicate";
  if (error.code === "22023" || error.code === "23514") return "invalid";
  if (error.code === "P0002") return "not_found";
  return "failed";
}

export async function createCampaign(
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const values = read(formData, ["name", "description", "partner", "endsOn", "maxTotal"]);
  const parsed = campaignSchema.safeParse(values);
  if (!parsed.success) return { error: "invalid", values };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_create_promo_campaign", {
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    partner: parsed.data.partner || undefined,
    ends_at: endOfDayInPoland(parsed.data.endsOn) ?? undefined,
    max_redemptions_total: parsed.data.maxTotal ?? undefined,
  });
  if (error) return { error: mapError(error), values };
  return redirect({
    href: { pathname: "/admin/promo/[campaign]", params: { campaign: data } },
    locale: await getLocale(),
  });
}

export async function generateCodes(
  campaign: string,
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const values = read(formData, ["benefit", "value", "count", "expiresOn", "newAccountsDays"]);
  const parsed = generateSchema.safeParse(values);
  if (!parsed.success) return { error: "invalid", values };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_generate_promo_codes", {
    campaign,
    how_many: parsed.data.count,
    benefit_type: parsed.data.benefit,
    benefit_value: benefitValue(parsed.data) as number,
    expires_at: endOfDayInPoland(parsed.data.expiresOn) ?? undefined,
    new_accounts_days: parsed.data.newAccountsDays ?? undefined,
  });
  if (error) return { error: mapError(error), values };
  refresh();
  return { codes: data };
}

export async function createSharedCode(
  campaign: string,
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const values = read(formData, [
    "code",
    "benefit",
    "value",
    "maxUses",
    "expiresOn",
    "newAccountsDays",
  ]);
  const parsed = sharedSchema.safeParse(values);
  if (!parsed.success) return { error: "invalid", values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_create_shared_promo_code", {
    campaign,
    code: parsed.data.code,
    benefit_type: parsed.data.benefit,
    benefit_value: benefitValue(parsed.data) as number,
    max_uses: parsed.data.maxUses,
    expires_at: endOfDayInPoland(parsed.data.expiresOn) ?? undefined,
    new_accounts_days: parsed.data.newAccountsDays ?? undefined,
  });
  if (error) return { error: mapError(error), values };
  refresh();
  return { done: true };
}

/** Switches a campaign on or off (immediate; the database audits it). */
export async function setCampaignActive(campaign: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_promo_campaign_active", { campaign, active });
  if (error) throw error;
  refresh();
}

/** Switches one code on or off (immediate; the database audits it). */
export async function setCodeActive(code: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_promo_code_active", { code, active });
  if (error) throw error;
  refresh();
}

export async function revokeRedemption(
  redemption: string,
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const values = read(formData, ["reason"]);
  const reason = values.reason!.trim();
  if (reason.length < 5 || reason.length > 500) return { error: "invalid", values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_promo_redemption", { redemption, reason });
  if (error) return { error: mapError(error), values };
  refresh();
  return { done: true };
}
