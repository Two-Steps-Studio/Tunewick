"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { setReminder } from "../actions";

/** "Remind me": on the premiere the release lands in the listener's library. */
export function ReminderButton({ releaseId, initial }: { releaseId: string; initial: boolean }) {
  const t = useTranslations("Premiere");
  const [saved, setSaved] = useState(initial);
  const [on, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();
  return (
    <div className="premiere__remind">
      <button
        type="button"
        className={on ? "button" : "button button--primary"}
        aria-pressed={on}
        onClick={() => {
          const next = !on;
          setFailed(false);
          startTransition(async () => {
            setOptimistic(next);
            const result = await setReminder(releaseId, next);
            setSaved(result.on);
            if (!result.ok) setFailed(true);
          });
        }}
      >
        {on ? t("reminded") : t("remind")}
      </button>
      <p className="field__hint" role="status">
        {/* Confirmed by the server (saved), not the optimistic state. */}
        {failed ? t("failed") : saved ? t("remindedHint") : t("remindHint")}
      </p>
    </div>
  );
}
