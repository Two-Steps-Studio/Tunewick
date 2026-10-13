"use client";

import type { QualityTier } from "@tunewick/shared";
import { getPlayer } from "../store";
import type { PlayerTrack } from "../types";

/** Starts the queue at `index`. The quality limit comes from the server (plan), never the client. */
export function PlayButton({
  tracks,
  index,
  entitlement,
  label,
  children,
  className = "button button--quiet",
  shuffle = false,
}: {
  tracks: PlayerTrack[];
  index: number;
  entitlement: QualityTier;
  label: string;
  children: React.ReactNode;
  className?: string;
  /** Plays the tracks in a fresh random order (from the first of the shuffled list). */
  shuffle?: boolean;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        const player = getPlayer();
        player.configure({ setting: "auto", entitlement });
        void player.playQueue(shuffle ? shuffled(tracks) : tracks, shuffle ? 0 : index);
      }}
    >
      {children}
    </button>
  );
}

/** Fisher-Yates on a copy: every order equally likely, the original list untouched. */
function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
