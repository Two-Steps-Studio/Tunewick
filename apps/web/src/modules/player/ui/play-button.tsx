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
}: {
  tracks: PlayerTrack[];
  index: number;
  entitlement: QualityTier;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        const player = getPlayer();
        player.configure({ setting: "auto", entitlement });
        void player.playQueue(tracks, index);
      }}
    >
      {children}
    </button>
  );
}
