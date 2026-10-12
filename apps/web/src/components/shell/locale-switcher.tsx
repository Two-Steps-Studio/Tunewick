"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { type getPathname, Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { languageName } from "@/lib/intl";

type Href = Parameters<typeof getPathname>[0]["href"];

/** The interface language menu: each language named in itself, the current page in each. */
export function LocaleSwitcher() {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const menu = useRef<HTMLDetailsElement>(null);

  // Close on navigation and on a click elsewhere.
  useEffect(() => {
    menu.current?.removeAttribute("open");
  }, [pathname]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute("open");
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <details ref={menu} className="locale-switcher">
      <summary
        aria-label={`${t("language")}: ${languageName(locale, locale)}`}
        title={t("language")}
      >
        {locale.toUpperCase()}
      </summary>
      <ul className="locale-switcher__menu">
        {routing.locales.map((code) => (
          <li key={code}>
            <Link
              // The current route params always match the current pathname template.
              href={{ pathname, params } as Href}
              locale={code}
              lang={code}
              hrefLang={code}
              aria-current={code === locale ? "true" : undefined}
              className="locale-switcher__option"
            >
              {languageName(code, code)}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
