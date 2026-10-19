"use client";

import { useTransition } from "react";
import { getPlayer } from "@/modules/player";
import { getChartPlayback } from "../actions";

/**
 * Plays a list of tracks as one queue; the audio is prepared on tap, so a page full of music
 * renders without presigning anything.
 */
export function PlayTracks({
  trackIds,
  label,
  className,
  children,
}: {
  trackIds: string[];
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const play = () =>
    start(async () => {
      const playback = await getChartPlayback(trackIds.slice(0, 20));
      if (!playback) return;
      const player = getPlayer();
      player.configure({ setting: "auto", entitlement: playback.entitlement });
      await player.playQueue(playback.tracks, 0);
    });
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-busy={pending || undefined}
      disabled={pending || trackIds.length === 0}
      onClick={play}
    >
      {children}
    </button>
  );
}
