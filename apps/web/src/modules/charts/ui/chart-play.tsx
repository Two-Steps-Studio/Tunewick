"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { getPlayer } from "@/modules/player";
import { getChartPlayback } from "../actions";

/** Plays a chart from this row on (the next ten tracks), fetched on tap. */
export function ChartPlay({ trackIds, label }: { trackIds: string[]; label: string }) {
  const t = useTranslations("Charts");
  const [pending, start] = useTransition();
  const play = () =>
    start(async () => {
      const playback = await getChartPlayback(trackIds.slice(0, 10));
      if (!playback) return;
      const player = getPlayer();
      player.configure({ setting: "auto", entitlement: playback.entitlement });
      await player.playQueue(playback.tracks, 0);
    });
  return (
    <button
      type="button"
      className="chart-row__play"
      aria-label={label}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={play}
      title={t("play")}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
      </svg>
    </button>
  );
}
