"use client";

import type { WhyLine } from "@tunewick/shared";
import { useTranslations } from "next-intl";

/** "Why this song?" — the real signals behind a recommendation, in plain words. */
export function WhyPanel({ id, lines }: { id: string; lines: WhyLine[] }) {
  const t = useTranslations("Why");
  return (
    <div id={id} className="why-panel" role="region" aria-label={t("title")}>
      <p className="why-panel__title">{t("title")}</p>
      <ul className="why-panel__lines">
        {lines.map((line, i) => (
          <li key={i}>{t(line.key as "wildcard", line.values as Record<string, string>)}</li>
        ))}
      </ul>
      <p className="why-panel__note">{t("note")}</p>
    </div>
  );
}
