"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { getPlayer } from "../store";
import type { PlayerState } from "../types";
import {
  canGoNext,
  formatTime,
  Icon,
  LineIcon,
  QualityChip,
  qualityOf,
  QueueContents,
} from "./parts";

/** How far (px) or how fast (px/ms) a downward drag has to go to close the sheet. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.5;

/**
 * The full-screen player: big cover, the whole set of controls and the queue. A modal dialog
 * (focus stays inside, Escape closes); it slides up from the bar and is dragged down to close,
 * following the finger and keeping its momentum. Rendered only while open.
 */
export function NowPlaying({
  state,
  actions,
  onClose,
}: {
  state: PlayerState;
  actions: React.ReactNode;
  onClose: () => void;
}) {
  const t = useTranslations("Player");
  const player = getPlayer();
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; time: number; dy: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const close = () => setClosing(true);

  const grab = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { y: event.clientY, time: event.timeStamp, dy: 0 };
      dialog.current?.style.setProperty("transition", "none");
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const state = drag.current;
      if (!state || !dialog.current) return;
      // Upwards it barely gives (rubber band); downwards it follows the finger.
      const raw = event.clientY - state.y;
      state.dy = raw > 0 ? raw : raw / 8;
      dialog.current.style.transform = `translateY(${state.dy}px)`;
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const state = drag.current;
      const element = dialog.current;
      drag.current = null;
      if (!state || !element) return;
      const velocity = state.dy / Math.max(1, event.timeStamp - state.time);
      element.style.removeProperty("transition");
      if (state.dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        // The closing animation starts where the finger let go (the inline transform).
        close();
      } else {
        element.style.removeProperty("transform");
      }
    },
    onPointerCancel(event: React.PointerEvent<HTMLElement>) {
      grab.onPointerUp(event);
    },
  };

  const track = state.queue[state.index];
  if (!track) return null;
  const playing = state.status === "playing" || state.status === "loading";
  const quality = state.now ? qualityOf(track, state.now, state.outputSampleRateHz) : null;
  const position = scrub ?? state.position;
  // The biggest cover there is (smallest first).
  const cover = track.artwork?.at(-1);
  const commit = () => {
    if (scrub !== null) void player.seek(scrub);
    setScrub(null);
  };

  return (
    <dialog
      ref={dialog}
      className="now-playing"
      aria-label={t("nowPlaying")}
      data-closing={closing || undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="now-playing__inner">
        <header className="now-playing__header" {...grab}>
          <span className="now-playing__grabber" aria-hidden="true" />
          <button
            type="button"
            className="player-button"
            onClick={close}
            aria-label={t("closeNowPlaying")}
          >
            <LineIcon name="collapse" />
          </button>
          <p className="queue-menu__label">{t("nowPlaying")}</p>
        </header>

        <div className="now-playing__art" {...grab}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variant of the cover
            <img src={cover.url} alt="" width={cover.width} height={cover.width} />
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="now-playing__meta">
          <div className="now-playing__names">
            <h2 className="now-playing__title">{track.title}</h2>
            <p className="now-playing__artist">{track.artist}</p>
          </div>
          {actions ? <div className="now-playing__actions">{actions}</div> : null}
        </div>

        <div className="now-playing__timeline">
          <input
            type="range"
            className="player-bar__seek"
            min={0}
            max={state.duration || 0}
            step={0.1}
            value={Math.min(position, state.duration || 0)}
            onChange={(event) => setScrub(Number(event.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            aria-label={t("seek")}
            aria-valuetext={t("seekValue", {
              position: formatTime(position),
              duration: formatTime(state.duration),
            })}
          />
          <span className="player-bar__time">{formatTime(position)}</span>
          <span className="player-bar__time">{formatTime(state.duration)}</span>
        </div>

        <div className="now-playing__controls">
          <button
            type="button"
            className="player-button player-button--mode"
            onClick={() => player.toggleShuffle()}
            aria-pressed={state.shuffle}
            aria-label={t("shuffle")}
            disabled={Boolean(state.clip)}
          >
            <LineIcon name="shuffle" />
          </button>
          <button
            type="button"
            className="player-button player-button--large"
            onClick={() => void player.previous()}
            aria-label={t("previous")}
          >
            <Icon name="previous" />
          </button>
          <button
            type="button"
            className="player-button player-button--main player-button--hero"
            onClick={() => player.toggle()}
            aria-label={playing ? t("pause") : t("play")}
          >
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button
            type="button"
            className="player-button player-button--large"
            onClick={() => void player.next()}
            disabled={!canGoNext(state)}
            aria-label={t("next")}
          >
            <Icon name="next" />
          </button>
          <button
            type="button"
            className="player-button player-button--mode"
            onClick={() => player.cycleRepeat()}
            aria-pressed={state.repeat !== "off"}
            aria-label={t(`repeat.${state.repeat}`)}
            disabled={Boolean(state.clip)}
          >
            <LineIcon name={state.repeat === "one" ? "repeatOne" : "repeat"} />
          </button>
        </div>

        {quality && state.now ? <QualityChip quality={quality} now={state.now} /> : null}
        {state.error ? (
          <p className="player-bar__error" role="alert">
            {t(`error.${state.error}`)}
          </p>
        ) : null}

        {state.clip ? null : (
          <section className="now-playing__queue" aria-label={t("queue")}>
            <QueueContents state={state} />
          </section>
        )}
      </div>
    </dialog>
  );
}
