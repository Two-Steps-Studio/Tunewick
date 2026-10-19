"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adCampaignSchema } from "./validation";

export type AdAdminError =
  "invalid" | "release_not_found" | "mfa_required" | "not_allowed" | "failed";

export interface AdFormState {
  error?: AdAdminError;
  /** What was submitted, kept on failure (React resets forms after every action). */
  values?: Record<string, string | string[]>;
  done?: boolean;
}

function mapError(error: { code?: string; hint?: string }): AdAdminError {
  if (error.hint === "mfa_required") return "mfa_required";
  if (error.code === "42501") return "not_allowed";
  if (error.code === "P0002") return "release_not_found";
  if (error.code === "22023" || error.code === "23514") return "invalid";
  return "failed";
}

/** Creates (no `campaign`) or updates a campaign. New campaigns start paused. */
export async function saveAdCampaign(
  campaign: string | null,
  _prev: AdFormState,
  formData: FormData,
): Promise<AdFormState> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const values = {
    advertiser: text("advertiser"),
    headline: text("headline"),
    body: text("body"),
    cta: text("cta"),
    url: text("url"),
    release: text("release"),
    placements: formData.getAll("placements").map(String),
    locales: formData.getAll("locales").map(String),
    weight: text("weight") || "1",
    startsOn: text("startsOn"),
    endsOn: text("endsOn"),
  };
  const parsed = adCampaignSchema.safeParse(values);
  if (!parsed.success) return { error: "invalid", values };
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_save_ad_campaign", {
    // The generated types mark nullable arguments as required strings.
    campaign: campaign as string,
    advertiser: v.advertiser,
    headline: v.headline,
    body: v.body,
    cta: v.cta,
    url: v.url,
    release_ref: v.release,
    placements: v.placements,
    locales: v.locales,
    weight: v.weight,
    starts_at: (v.startsOn ? `${v.startsOn} 00:00:00 Europe/Warsaw` : null) as string,
    ends_at: (v.endsOn ? `${v.endsOn} 23:59:59 Europe/Warsaw` : null) as string,
  });
  if (error) return { error: mapError(error), values };
  refresh();
  return { done: true };
}

export async function setAdCampaignActive(campaign: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_ad_campaign_active", { campaign, active });
  if (error) return { error: mapError(error) };
  refresh();
  return {};
}
