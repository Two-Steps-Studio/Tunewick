"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type getPathname, Link, usePathname } from "@/i18n/navigation";

type Href = Parameters<typeof getPathname>[0]["href"];

export function LocaleSwitcher() {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const other = locale === "pl" ? "en" : "pl";

  return (
    <Link
      // The current route params always match the current pathname template.
      href={{ pathname, params } as Href}
      locale={other}
      lang={other}
      hrefLang={other}
      className="locale-switcher"
      aria-label={`${other.toUpperCase()} — ${t("switchTo")}`}
      title={`${t("language")}: ${t("switchTo")}`}
    >
      {other.toUpperCase()}
    </Link>
  );
}
