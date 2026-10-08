import "server-only";

import { FEED, isDiscoveryMode } from "@tunewick/shared";
import { cookies } from "next/headers";
import { z } from "zod";
import { countryName } from "@/lib/intl";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DiscoveryPreferences } from "./types";

/** Visitors' choices live in this cookie only (nothing about visitors is stored server-side). */
export const VISITOR_COOKIE = "tw_discovery";

export const DEFAULT_PREFERENCES: DiscoveryPreferences = {
  countryCode: null,
  city: null,
  languages: [],
  genreIds: [],
  mode: "for_you",
  explorationShare: FEED.explorationShare,
  hideExplicit: false,
  showInRankings: true,
  timeZone: "UTC",
  onboarded: false,
};

export const visitorCookieSchema = z.object({
  c: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  g: z.array(z.number().int().positive()).max(12).optional(),
  l: z
    .array(z.string().regex(/^[a-z]{2,3}$/))
    .max(8)
    .optional(),
  m: z.string().optional(),
  x: z.boolean().optional(),
});

function fromCookie(raw: string | undefined): DiscoveryPreferences | null {
  if (!raw) return null;
  try {
    const parsed = visitorCookieSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const value = parsed.data;
    return {
      ...DEFAULT_PREFERENCES,
      countryCode: value.c ?? null,
      genreIds: value.g ?? [],
      languages: value.l ?? [],
      mode: isDiscoveryMode(value.m) ? value.m : "for_you",
      hideExplicit: value.x ?? false,
      onboarded: true,
    };
  } catch {
    return null;
  }
}

/** The listener's discovery preferences, and whether they come from an account. */
export async function getDiscoveryPreferences(): Promise<{
  preferences: DiscoveryPreferences;
  signedIn: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    const cookie = (await cookies()).get(VISITOR_COOKIE)?.value;
    return { preferences: fromCookie(cookie) ?? DEFAULT_PREFERENCES, signedIn: false };
  }
  const { data, error } = await supabase
    .from("listener_preferences")
    .select(
      "country_code, city, content_languages, genre_ids, discovery_mode, exploration_share, hide_explicit, show_in_rankings, time_zone, onboarded_at",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) return { preferences: DEFAULT_PREFERENCES, signedIn: true };
  return {
    signedIn: true,
    preferences: {
      countryCode: data.country_code,
      city: data.city,
      languages: data.content_languages,
      genreIds: data.genre_ids,
      mode: isDiscoveryMode(data.discovery_mode) ? data.discovery_mode : "for_you",
      explorationShare: Number(data.exploration_share),
      hideExplicit: data.hide_explicit,
      showInRankings: data.show_in_rankings,
      timeZone: data.time_zone,
      onboarded: data.onboarded_at !== null,
    },
  };
}

/** Genres with their name in the interface language (other locales fall back to English). */
export async function getGenres(locale: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("genres")
    .select("id, slug, name_pl, name_en")
    .order("id");
  if (error) throw error;
  return data.map((g) => ({
    id: g.id,
    slug: g.slug,
    name: locale === "pl" ? g.name_pl : g.name_en,
  }));
}

/** Countries with names in `locale`, sorted for a picker. */
export async function getCountryOptions(locale: string) {
  const codes = await getCountryCodes();
  return codes
    .map((c) => ({ code: c.code, name: countryName(c.code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export async function getCountryCodes() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("countries").select("code, region").order("code");
  if (error) throw error;
  return data;
}
