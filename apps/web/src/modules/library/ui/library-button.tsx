"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { type LibraryKind, setLibraryItem } from "../actions";

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Like (tracks, releases) or follow (artists). Toggles instantly; if the database refuses,
 * the button returns to the real state and says so.
 */
export function LibraryButton({
  kind,
  id,
  initial,
  name,
  variant = "icon",
}: {
  kind: LibraryKind;
  id: string;
  initial: boolean;
  /** What is liked, for the accessible name ("Polub: Szychta"). */
  name: string;
  variant?: "icon" | "text";
}) {
  const t = useTranslations("Library.actions");
  const [saved, setSaved] = useState(initial);
  const [on, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setFailed(false);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setLibraryItem(kind, id, next);
      setSaved(result.on);
      if (!result.ok) setFailed(true);
    });
  };

  const label =
    kind === "artist"
      ? on
        ? t("unfollow", { name })
        : t("follow", { name })
      : on
        ? t("unlike", { name })
        : t("like", { name });

  return (
    <span className="library-button__wrap">
      <button
        type="button"
        className={
          variant === "icon"
            ? "player-button library-button"
            : on
              ? "button library-button library-button--text"
              : "button button--primary library-button library-button--text"
        }
        aria-pressed={on}
        aria-label={variant === "icon" ? label : undefined}
        onClick={toggle}
      >
        {variant === "icon" ? (
          <Heart filled={on} />
        ) : kind === "artist" ? (
          on ? (
            t("following")
          ) : (
            t("followShort")
          )
        ) : (
          <>
            <Heart filled={on} /> {on ? t("liked") : t("likeShort")}
          </>
        )}
      </button>
      {failed ? (
        <span role="alert" className="field__error">
          {t("failed")}
        </span>
      ) : null}
    </span>
  );
}
