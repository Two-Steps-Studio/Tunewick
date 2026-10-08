"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Like / Save / Follow on a feed card. Toggles instantly; when the database refuses, it returns
 * to the real state and says so (no guessed state is ever shown as saved).
 */
export function ToggleAction({
  initial,
  icon,
  activeIcon = icon,
  label,
  activeLabel,
  text,
  activeText,
  failedText,
  onToggle,
  onChanged,
}: {
  initial: boolean;
  icon: IconName;
  activeIcon?: IconName;
  /** Accessible names (include what is acted on). */
  label: string;
  activeLabel: string;
  text: string;
  activeText: string;
  failedText: string;
  onToggle: (on: boolean) => Promise<{ ok: boolean; on: boolean }>;
  onChanged?: (on: boolean) => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [on, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="feed-action"
      aria-pressed={on}
      aria-label={on ? activeLabel : label}
      title={failed ? failedText : undefined}
      data-failed={failed || undefined}
      onClick={() => {
        const next = !on;
        setFailed(false);
        startTransition(async () => {
          setOptimistic(next);
          const result = await onToggle(next);
          setSaved(result.on);
          if (!result.ok) setFailed(true);
          else onChanged?.(result.on);
        });
      }}
    >
      <Icon name={on ? activeIcon : icon} filled={on && activeIcon === icon} />
      <span className="feed-action__label" aria-hidden="true">
        {on ? activeText : text}
      </span>
    </button>
  );
}
