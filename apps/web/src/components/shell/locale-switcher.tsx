"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "pl" ? "en" : "pl";

  return (
    <Link
      href={pathname}
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
