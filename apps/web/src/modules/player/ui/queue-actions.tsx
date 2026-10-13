"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { getPlayer } from "../store";
import type { PlayerTrack } from "../types";

/** "Play next" / "Add to queue" for one track (inside a track's menu). */
export function QueueActions({ track }: { track: PlayerTrack }) {
  const t = useTranslations("Player");
  const [done, setDone] = useState<"next" | "last" | null>(null);
  return (
    <div className="queue-actions">
      <button
        type="button"
        className="button"
        onClick={() => {
          getPlayer().playNext(track);
          setDone("next");
        }}
      >
        {t("playNext")}
      </button>
      <button
        type="button"
        className="button"
        onClick={() => {
          getPlayer().addToQueue(track);
          setDone("last");
        }}
      >
        {t("addToQueue")}
      </button>
      {done ? (
        <p role="status" className="field__hint">
          {done === "next" ? t("queuedNext") : t("queuedLast")}
        </p>
      ) : null}
    </div>
  );
}
