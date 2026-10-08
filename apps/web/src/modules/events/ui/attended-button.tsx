"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { setAttended } from "../actions";

/** "Byłem przy tym": a private memory of a gig, not a counter. */
export function AttendedButton({ eventId, initial }: { eventId: string; initial: boolean }) {
  const t = useTranslations("Events.attended");
  const [saved, setSaved] = useState(initial);
  const [on, setOptimistic] = useOptimistic(saved);
  const [problem, setProblem] = useState<"not_started" | "too_late" | "failed" | null>(null);
  const [, startTransition] = useTransition();

  return (
    <span className="library-button__wrap">
      <button
        type="button"
        className={on ? "button library-button library-button--text" : "button button--primary"}
        aria-pressed={on}
        onClick={() => {
          const next = !on;
          setProblem(null);
          startTransition(async () => {
            setOptimistic(next);
            const result = await setAttended(eventId, next);
            setSaved(result.on);
            if (!result.ok) setProblem(result.reason);
          });
        }}
      >
        {on ? t("marked") : t("mark")}
      </button>
      <span className="field__hint">{t("private")}</span>
      {problem ? (
        <span role="alert" className="field__error">
          {t(`errors.${problem}`)}
        </span>
      ) : null}
    </span>
  );
}
