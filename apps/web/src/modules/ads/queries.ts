import "server-only";

import type { Database } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getImageSources, type ImageSources } from "@/modules/images";

export type AdPlacement = Database["public"]["Enums"]["ad_placement"];

export interface Ad {
  id: string;
  placement: AdPlacement;
  advertiser: string;
  headline: string;
  body: string | null;
  cta: string;
  /** External destination; null when the ad promotes a release on Tunewick. */
  url: string | null;
  release: { artistSlug: string; releaseSlug: string } | null;
  artwork: ImageSources | null;
}

/**
 * A sponsor card for `placement`, or null: Premium listeners, no running campaign, or any error
 * (an ad is never a reason for a page to fail). Chosen by placement and language only.
 */
export async function getAd(placement: AdPlacement, locale: string): Promise<Ad | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("ad_for", { placement, locale }).maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      placement,
      advertiser: data.advertiser,
      headline: data.headline,
      body: data.body,
      cta: data.cta,
      url: data.url,
      release:
        data.release_slug && data.artist_slug
          ? { artistSlug: data.artist_slug, releaseSlug: data.release_slug }
          : null,
      artwork: await getImageSources(data.artwork_image_id, 160),
    };
  } catch {
    return null;
  }
}

export type AdminAdCampaign =
  Database["public"]["Functions"]["admin_ad_campaigns"]["Returns"][number];

export async function getAdCampaigns(): Promise<AdminAdCampaign[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_ad_campaigns");
  if (error) throw error;
  return data ?? [];
}
