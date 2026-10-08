"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { setUserFollow } from "../follow-actions";

/** Follow a person. Instant; returns to the real state (and says so) if the database refuses. */
export function UserFollowButton({
  personId,
  name,
  initial,
}: {
  personId: string;
  name: string;
  initial: boolean;
}) {
  const t = useTranslations("Profile");
  const [saved, setSaved] = useState(initial);
  const [on, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();
  return (
    <span className="library-button__wrap">
      <button
        type="button"
        className={
          on ? "button library-button--text" : "button button--primary library-button--text"
        }
        aria-pressed={on}
        aria-label={on ? t("unfollow", { name }) : t("follow", { name })}
        onClick={() => {
          const next = !on;
          setFailed(false);
          startTransition(async () => {
            setOptimistic(next);
            const result = await setUserFollow(personId, next);
            setSaved(result.on);
            if (!result.ok) setFailed(true);
          });
        }}
      >
        {on ? t("following") : t("followShort")}
      </button>
      {failed ? (
        <span role="alert" className="field__error">
          {t("failed")}
        </span>
      ) : null}
    </span>
  );
}
