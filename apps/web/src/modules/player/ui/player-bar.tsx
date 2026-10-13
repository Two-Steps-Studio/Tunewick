"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getPlayer, startListeningReports, usePlayerState } from "../store";
import type { PlayerState } from "../types";
import { NowPlaying } from "./now-playing";
import {
  canGoNext,
  formatTime,
  Icon,
  LineIcon,
  QualityChip,
  qualityOf,
  QueueContents,
} from "./parts";

/** The queue as a panel above the bar. */
function QueueMenu({ state }: { state: PlayerState }) {
  const t = useTranslations("Player");
  const current = state.queue[state.index];
  // Rendered only while open: the bar re-renders every tick, a hidden list would too.
  const [open, setOpen] = useState(false);
  return (
    <details className="queue-menu" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="player-button" aria-label={t("queue")}>
        <LineIcon name="queue" />
      </summary>
      {open ? (
        <div className="queue-menu__panel">
          <p className="queue-menu__label">{t("nowPlaying")}</p>
          {current ? (
            <p className="queue-menu__now">
              <span className="queue-menu__title">{current.title}</span>
              <span className="queue-menu__artist">{current.artist}</span>
            </p>
          ) : null}
          <QueueContents state={state} />
        </div>
      ) : null}
    </details>
  );
}

/** Typing in a field or working a control keeps its own keys. */
function ownsKeys(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY", "A"].includes(target.tagName) ||
    target.getAttribute("role") === "slider"
  );
}

/**
 * Persistent player in the shell. With an empty queue it shows the honest idle state - no fake
 * track, no dead controls.
 *
 * `reportListens`: keep a listening history for the signed-in listener. `actions`: extra controls
 * for the current track from other modules (e.g. add to playlist), shown while something plays.
 */
export function PlayerBar({
  reportListens = false,
  actions = null,
}: {
  reportListens?: boolean;
  actions?: React.ReactNode;
}) {
  const t = useTranslations("Player");
  const state = usePlayerState();
  useEffect(() => {
    if (reportListens) startListeningReports();
  }, [reportListens]);

  // Keyboard: Space play/pause, ←/→ previous/next track, M mute. Never while
  // typing or on a focused control (they keep their own keys); no animation on keyboard actions.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (ownsKeys(event.target)) return;
      const player = getPlayer();
      if (!player.getState().queue.length) return;
      const actions: Record<string, () => void> = {
        " ": () => player.toggle(),
        ArrowRight: () => void player.next(),
        ArrowLeft: () => void player.previous(),
        m: () => player.toggleMute(),
        M: () => player.toggleMute(),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [scrub, setScrub] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const track = state.queue[state.index];

  if (!track) {
    return (
      <section aria-label={t("region")} className="player-bar">
        <span className="player-bar__spark" aria-hidden="true" />
        <p className="player-bar__text">
          <span>{t("idle")}</span> <span className="player-bar__hint">{t("idleHint")}</span>
        </p>
      </section>
    );
  }

  const player = getPlayer();
  const playing = state.status === "playing" || state.status === "loading";
  const quality = state.now ? qualityOf(track, state.now, state.outputSampleRateHz) : null;
  const position = scrub ?? state.position;
  // The smallest cover size that is still sharp at 48 px on a 2× screen.
  const cover = track.artwork?.find((image) => image.width >= 96) ?? track.artwork?.at(-1);
  const commit = () => {
    if (scrub !== null) void player.seek(scrub);
    setScrub(null);
  };

  return (
    <section
      aria-label={t("region")}
      className="player-bar player-bar--active"
      data-status={state.status}
    >
      <div className="player-bar__controls">
        <button
          type="button"
          className="player-button"
          onClick={() => void player.previous()}
          aria-label={t("previous")}
        >
          <Icon name="previous" />
        </button>
        <button
          type="button"
          className="player-button player-button--main"
          onClick={() => player.toggle()}
          aria-label={playing ? t("pause") : t("play")}
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button
          type="button"
          className="player-button"
          onClick={() => void player.next()}
          disabled={!canGoNext(state)}
          aria-label={t("next")}
        >
          <Icon name="next" />
        </button>
      </div>

      {/* The cover and the title open the full-screen player (the title is the keyboard way). */}
      <button
        type="button"
        className="player-bar__expand"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setExpanded(true)}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variant of the cover
          <img className="player-bar__cover" src={cover.url} alt="" width={48} height={48} />
        ) : (
          <span className="player-bar__cover" />
        )}
      </button>
      <div className="player-bar__now">
        <button
          type="button"
          className="player-bar__title"
          aria-haspopup="dialog"
          aria-describedby="player-expand-hint"
          onClick={() => setExpanded(true)}
        >
          <span aria-live="polite" className="player-bar__names">
            {state.clip ? <span className="player-bar__soundcheck">{t("soundcheck")}</span> : null}
            <span className="player-bar__track">{track.title}</span>
            <span className="player-bar__artist">{track.artist}</span>
          </span>
        </button>
        <span id="player-expand-hint" hidden>
          {t("openNowPlaying")}
        </span>
        <div className="player-bar__timeline">
          <span className="player-bar__time">{formatTime(position)}</span>
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
          <span className="player-bar__time">{formatTime(state.duration)}</span>
        </div>
      </div>

      <div className="player-bar__side">
        {quality && state.now ? <QualityChip quality={quality} now={state.now} /> : null}
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
          className="player-button player-button--mode"
          onClick={() => player.cycleRepeat()}
          aria-pressed={state.repeat !== "off"}
          aria-label={t(`repeat.${state.repeat}`)}
          disabled={Boolean(state.clip)}
        >
          <LineIcon name={state.repeat === "one" ? "repeatOne" : "repeat"} />
        </button>
        {state.clip ? null : <QueueMenu state={state} />}
        {actions}
        <input
          type="range"
          className="player-bar__volume"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          onChange={(event) => player.setVolume(Number(event.target.value))}
          aria-label={t("volume")}
        />
      </div>

      {state.error ? (
        <p className="player-bar__error" role="alert">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
      {expanded ? (
        <NowPlaying state={state} actions={actions} onClose={() => setExpanded(false)} />
      ) : null}
    </section>
  );
}
