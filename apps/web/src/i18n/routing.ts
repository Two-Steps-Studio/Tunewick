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
  },
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
