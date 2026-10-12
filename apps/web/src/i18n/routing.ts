import { defineRouting } from "next-intl/routing";

/**
 * Interface languages. Polish and English have their own URL paths; the others use the English
 * paths (localized slugs can be added per language later without breaking links: next-intl
 * redirects the old path). Messages missing from a language fall back to English (request.ts).
 */
const LOCALES = ["pl", "en", "de", "es", "fr", "pt"] as const;

/** A route whose Polish and English paths differ; every other language uses the English one. */
function paths<P extends string, E extends string>(pl: P, en: E) {
  return { pl, en, de: en, es: en, fr: en, pt: en };
}

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "pl",
  localePrefix: "as-needed",
  pathnames: {
    "/": "/",
    "/browse": paths("/przegladaj", "/browse"),
    "/welcome": paths("/witaj", "/welcome"),
    "/you": paths("/ty", "/you"),
    "/you/stats": paths("/ty/statystyki", "/you/stats"),
    "/you/recap": paths("/ty/podsumowanie", "/you/recap"),
    "/you/replay": paths("/ty/replay", "/you/replay"),
    "/you/friends": paths("/ty/znajomi", "/you/friends"),
    "/you/compare/[handle]": paths("/ty/porownaj/[handle]", "/you/compare/[handle]"),
    "/rankings": paths("/rankingi", "/rankings"),
    "/charts": paths("/listy", "/charts"),
    "/today": paths("/dzis", "/today"),
    // Shared links: the same path in every language (tunewick.com/song/artist/song).
    "/song/[artist]/[song]": "/song/[artist]/[song]",
    "/scene": paths("/scena", "/scene"),
    "/for-artists": paths("/dla-artystow", "/for-artists"),
    "/atlas": paths("/atlas", "/atlas"),
    "/atlas/[country]": paths("/atlas/[country]", "/atlas/[country]"),
    "/atlas/[country]/[city]": paths("/atlas/[country]/[city]", "/atlas/[country]/[city]"),
    "/search": paths("/szukaj", "/search"),
    "/library": paths("/biblioteka", "/library"),
    "/login": paths("/logowanie", "/login"),
    "/signup": paths("/rejestracja", "/signup"),
    "/reset-password": paths("/reset-hasla", "/reset-password"),
    "/update-password": paths("/nowe-haslo", "/new-password"),
    "/check-email": paths("/sprawdz-poczte", "/check-email"),
    "/settings": paths("/ustawienia", "/settings"),
    "/settings/security": paths("/ustawienia/bezpieczenstwo", "/settings/security"),
    "/verify": paths("/weryfikacja", "/verify"),
    "/artists/new": paths("/artysci/nowy", "/artists/new"),
    "/artists/[slug]": paths("/artysci/[slug]", "/artists/[slug]"),
    "/artists/[slug]/manage": paths("/artysci/[slug]/zarzadzaj", "/artists/[slug]/manage"),
    "/artists/[slug]/releases/new": paths(
      "/artysci/[slug]/wydawnictwa/nowe",
      "/artists/[slug]/releases/new",
    ),
    "/artists/[slug]/releases/[release]": paths(
      "/artysci/[slug]/wydawnictwa/[release]",
      "/artists/[slug]/releases/[release]",
    ),
    "/artists/[slug]/releases/[release]/edit": paths(
      "/artysci/[slug]/wydawnictwa/[release]/edytuj",
      "/artists/[slug]/releases/[release]/edit",
    ),
    "/events/[id]": paths("/wydarzenia/[id]", "/events/[id]"),
    "/venues/[slug]": paths("/miejsca/[slug]", "/venues/[slug]"),
    "/report": paths("/zglos", "/report"),
    "/terms": paths("/regulamin", "/terms"),
    "/artist-terms": paths("/regulamin-dla-artystow", "/artist-terms"),
    "/privacy": paths("/prywatnosc", "/privacy"),
    "/content-policy": paths("/zasady-tresci", "/content-policy"),
    "/playlists/[id]": paths("/playlisty/[id]", "/playlists/[id]"),
    "/profile/[handle]": paths("/profil/[handle]", "/profile/[handle]"),
    "/moderation": paths("/moderacja", "/moderation"),
    "/moderation/[release]": paths("/moderacja/[release]", "/moderation/[release]"),
    "/admin": "/admin",
    "/admin/promo": paths("/admin/promocje", "/admin/promotions"),
    "/admin/promo/[campaign]": paths("/admin/promocje/[campaign]", "/admin/promotions/[campaign]"),
    // Developer-only (404 in production unless TUNEWICK_DEV_PAGES=1).
    "/dev/player": "/dev/player",
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
/** Pathnames without dynamic segments (usable as plain redirect targets). */
export type StaticPathname = Exclude<AppPathname, `${string}[${string}`>;
