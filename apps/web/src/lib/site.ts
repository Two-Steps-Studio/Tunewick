import "server-only";

import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

type Href = Parameters<typeof getPathname>[0]["href"];

/**
 * The public origin of the site: NEXT_PUBLIC_SITE_URL when set (the production domain), else the
 * Vercel production domain, else the local dev server. Used for absolute URLs in metadata,
 * sitemaps and structured data.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Absolute URL of a localized page. */
export function absoluteUrl(href: Href, locale: Locale): string {
  return `${siteUrl()}${getPathname({ href, locale })}`;
}

/**
 * Canonical URL of the page in this locale and its other language versions (hreflang), with
 * x-default pointing at English (the version for visitors whose language isn't offered) — so
 * search engines index each language once.
 */
export function alternates(href: Href, locale: Locale): Metadata["alternates"] {
  return {
    canonical: absoluteUrl(href, locale),
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(href, l)])),
      "x-default": absoluteUrl(href, "en"),
    },
  };
}

/** A JSON-LD script body (schema.org); `<` escaped so data can never close the script tag. */
export function jsonLd(data: Record<string, unknown>): { __html: string } {
  return {
    __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c"),
  };
}
