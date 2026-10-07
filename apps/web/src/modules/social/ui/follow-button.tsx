"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { setFollow } from "../actions";

/** Follow a person. Toggles instantly; if the database refuses, it shows the real state. */
export function FollowButton({
  profileId,
  initial,
  name,
}: {
  profileId: string;
  initial: boolean;
  name: string;
}) {
  const t = useTranslations("Social");
  const [saved, setSaved] = useState(initial);
  const [on, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setFailed(false);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setFollow(profileId, next);
      setSaved(result.on);
      if (!result.ok) setFailed(true);
    });
  };

  return (
    <span className="library-button__wrap">
      <button
        type="button"
        className={
          on ? "button library-button--text" : "button button--primary library-button--text"
        }
        aria-pressed={on}
        aria-label={on ? t("unfollow", { name }) : t("follow", { name })}
        onClick={toggle}
      >
        {on ? t("following") : t("followShort")}
      </button>
      {failed ? (
        <span role="alert" className="field__error">
          {t("followFailed")}
        </span>
      ) : null}
    </span>
  );
}
