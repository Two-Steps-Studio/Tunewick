import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

// Accounts, a listener's own pages, staff tools and APIs stay out of search results.
const PRIVATE = ["/settings", "/you", "/library", "/admin", "/moderation"] as const;

export default function robots(): MetadataRoute.Robots {
  const localized = routing.locales.flatMap((locale) => [
    ...PRIVATE.map((pathname) => getPathname({ href: pathname, locale })),
    // Developer pages (no localized pathname of their own).
    locale === routing.defaultLocale ? "/dev" : `/${locale}/dev`,
  ]);
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...new Set(localized)],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
