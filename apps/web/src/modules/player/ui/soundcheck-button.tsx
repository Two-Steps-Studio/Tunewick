"use client";

import type { QualityTier } from "@tunewick/shared";
import { getPlayer } from "../store";
import type { PlayerTrack } from "../types";

/** Plays a soundcheck: a ≤ 30 s excerpt the artist chose (or the start of the track). */
export function SoundcheckButton({
  track,
  start,
  length,
  entitlement,
  label,
  children,
}: {
  track: PlayerTrack;
  start: number;
  length: number;
  entitlement: QualityTier;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="soundcheck-button"
      aria-label={label}
      onClick={() => {
        const player = getPlayer();
        player.configure({ setting: "auto", entitlement });
        void player.playClip(track, start, length);
      }}
    >
      {children}
    </button>
  );
}
