"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** Error state for a page segment (error.tsx): what happened, in plain words, and a retry. */
export function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Segment");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="segment-state" role="alert">
      <h1 className="segment-state__title">{t("errorTitle")}</h1>
      <p className="segment-state__text">{t("errorText")}</p>
      <button type="button" className="button button--primary" onClick={retry}>
        {t("retry")}
      </button>
      {error.digest ? <p className="segment-state__code">{error.digest}</p> : null}
    </section>
  );
}

/** Loading state: a few shimmering rows in the shape of what is coming. */
export function SegmentLoading({ rows = 8, label }: { rows?: number; label: string }) {
  return (
    <section className="segment-state segment-state--loading" aria-busy="true" aria-label={label}>
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--chips" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton--row" />
      ))}
    </section>
  );
}
