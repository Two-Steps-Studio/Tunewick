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
    "/profile/[handle]": { pl: "/profil/[handle]", en: "/profile/[handle]" },
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
/** Pathnames without dynamic segments (usable as plain redirect targets). */
export type StaticPathname = Exclude<AppPathname, `${string}[${string}`>;
