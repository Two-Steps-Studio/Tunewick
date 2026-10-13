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
  /** Turns shuffle mode on and plays the tracks in random order, from a random one. */
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
        void (shuffle ? player.playShuffled(tracks) : player.playQueue(tracks, index));
      }}
    >
      {children}
    </button>
  );
}
