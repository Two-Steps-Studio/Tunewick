"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getPlayer } from "@/modules/player";
import { PreviewPlayer, type PreviewState } from "../preview-player";
import type { FeedItem } from "../types";
import { Icon } from "./icons";

const IDLE: PreviewState = { trackId: null, status: "idle", position: 0, length: 0 };

/** The preview on a shared song page — no account needed. */
export function SongPreview({ item }: { item: FeedItem }) {
  const t = useTranslations("Feed");
  const [player] = useState(() => (typeof window === "undefined" ? null : new PreviewPlayer()));
  const state = useSyncExternalStore(
    player?.subscribe ?? (() => () => undefined),
    player?.getState ?? (() => IDLE),
    () => IDLE,
  );
  useEffect(() => {
    player?.setCallbacks({
      onStarted: () => {
        const main = getPlayer();
        if (main.getState().status === "playing") main.pause();
      },
    });
    void player?.show(item, null, false);
    return () => player?.destroy();
  }, [player, item]);

  if (!item.preview.sources.length) return <p className="field__hint">{t("previewUnavailable")}</p>;
  const playing = state.status === "playing" || state.status === "loading";
  const progress = state.length ? state.position / state.length : 0;
  return (
    <div className="song-preview">
      <button
        type="button"
        className="song-preview__button"
        onClick={() => void player?.toggle()}
        aria-label={
          playing
            ? t("pausePreview", { title: item.title })
            : t("playPreview", { title: item.title })
        }
      >
        <Icon name={playing ? "pause" : "play"} size={28} />
      </button>
      <div className="song-preview__text">
        <span>{playing ? t("previewPlaying") : t("listenPreview")}</span>
        <div
          className="feed-card__progress"
          role="progressbar"
          aria-label={t("previewProgress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}
