import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tunewick/shared";
import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { songSegment } from "@/lib/intl";
import { siteUrl } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { isSupabaseConfigured, supabaseConfig } from "@/lib/supabase/config";

// Rebuilt at most hourly; search engines read it far less often.
export const revalidate = 3600;

type Href = Parameters<typeof getPathname>[0]["href"];

const STATIC: Href[] = [
  "/",
  "/today",
  "/charts",
  "/atlas",
  "/scene",
  "/browse",
  "/rankings",
  "/search",
  "/terms",
  "/privacy",
  "/artist-terms",
  "/content-policy",
];

/** One entry per page, with every language version linked (hreflang). */
function entry(
  href: Href,
  lastModified?: string | null,
  priority?: number,
): MetadataRoute.Sitemap[number] {
  const url = (locale: Locale) => `${siteUrl()}${getPathname({ href, locale })}`;
  return {
    url: url(routing.defaultLocale),
    lastModified: lastModified ?? undefined,
    priority,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, url(l)])) },
  };
}

/** Public pages for search engines: the catalogue as anyone can see it (no session, RLS applies). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = STATIC.map((href) => entry(href, null, href === "/" ? 1 : 0.6));
  if (!isSupabaseConfigured()) return pages;
  const { url, publishableKey } = supabaseConfig();
  const supabase = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });

  // The catalogue part is best effort: a database hiccup still serves the static pages.
  const [artists, releases, tracks, venues, countries] = await Promise.all([
    supabase.from("artists").select("slug, updated_at").eq("status", "active").limit(10000),
    supabase
      .from("releases")
      .select("slug, updated_at, artists!inner(slug)")
      .eq("status", "published")
      .limit(10000),
    supabase
      .from("tracks")
      .select("title, public_code, updated_at, releases!inner(status, artists!inner(slug))")
      .eq("releases.status", "published")
      .order("updated_at", { ascending: false })
      .limit(20000),
    supabase.from("venues").select("slug").limit(5000),
    supabase.rpc("atlas_countries"),
  ]).catch(() => [null, null, null, null, null] as const);

  for (const a of artists?.data ?? []) {
    pages.push(entry({ pathname: "/artists/[slug]", params: { slug: a.slug } }, a.updated_at, 0.8));
  }
  for (const r of releases?.data ?? []) {
    pages.push(
      entry(
        {
          pathname: "/artists/[slug]/releases/[release]",
          params: { slug: r.artists.slug, release: r.slug },
        },
        r.updated_at,
        0.7,
      ),
    );
  }
  for (const t of tracks?.data ?? []) {
    pages.push(
      entry(
        {
          pathname: "/song/[artist]/[song]",
          params: {
            artist: t.releases.artists.slug,
            song: songSegment(t.title, t.public_code, slugify),
          },
        },
        t.updated_at,
        0.6,
      ),
    );
  }
  for (const v of venues?.data ?? []) {
    pages.push(entry({ pathname: "/venues/[slug]", params: { slug: v.slug } }, null, 0.4));
  }
  for (const c of countries?.data ?? []) {
    pages.push(
      entry(
        { pathname: "/atlas/[country]", params: { country: c.country_code.toLowerCase() } },
        null,
        0.5,
      ),
    );
  }
  return pages;
}
