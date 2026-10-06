import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pl", "en"],
  defaultLocale: "pl",
  localePrefix: "as-needed",
  pathnames: {
    "/": "/",
    "/scene": { pl: "/scena", en: "/scene" },
    "/search": { pl: "/szukaj", en: "/search" },
    "/library": { pl: "/biblioteka", en: "/library" },
    "/login": { pl: "/logowanie", en: "/login" },
    "/signup": { pl: "/rejestracja", en: "/signup" },
    "/reset-password": { pl: "/reset-hasla", en: "/reset-password" },
    "/update-password": { pl: "/nowe-haslo", en: "/new-password" },
    "/check-email": { pl: "/sprawdz-poczte", en: "/check-email" },
    "/settings": { pl: "/ustawienia", en: "/settings" },
    "/settings/security": { pl: "/ustawienia/bezpieczenstwo", en: "/settings/security" },
    "/verify": { pl: "/weryfikacja", en: "/verify" },
    "/artists/new": { pl: "/artysci/nowy", en: "/artists/new" },
    "/artists/[slug]": { pl: "/artysci/[slug]", en: "/artists/[slug]" },
    "/artists/[slug]/manage": { pl: "/artysci/[slug]/zarzadzaj", en: "/artists/[slug]/manage" },
    "/artists/[slug]/releases/new": {
      pl: "/artysci/[slug]/wydawnictwa/nowe",
      en: "/artists/[slug]/releases/new",
    },
    "/artists/[slug]/releases/[release]": {
      pl: "/artysci/[slug]/wydawnictwa/[release]",
      en: "/artists/[slug]/releases/[release]",
    },
    "/artists/[slug]/releases/[release]/edit": {
      pl: "/artysci/[slug]/wydawnictwa/[release]/edytuj",
      en: "/artists/[slug]/releases/[release]/edit",
    },
    "/report": { pl: "/zglos", en: "/report" },
    "/playlists/[id]": { pl: "/playlisty/[id]", en: "/playlists/[id]" },
    "/profile/[handle]": { pl: "/profil/[handle]", en: "/profile/[handle]" },
    "/moderation": { pl: "/moderacja", en: "/moderation" },
    "/moderation/[release]": { pl: "/moderacja/[release]", en: "/moderation/[release]" },
    "/admin": "/admin",
    "/admin/promo": { pl: "/admin/promocje", en: "/admin/promotions" },
    "/admin/promo/[campaign]": {
      pl: "/admin/promocje/[campaign]",
      en: "/admin/promotions/[campaign]",
    },
    // Developer-only (404 in production unless TUNEWICK_DEV_PAGES=1).
    "/dev/player": "/dev/player",
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
/** Pathnames without dynamic segments (usable as plain redirect targets). */
export type StaticPathname = Exclude<AppPathname, `${string}[${string}`>;
