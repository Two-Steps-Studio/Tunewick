"use client";

import { describeQuality, type QualityDescription } from "@tunewick/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getPlayer, startListeningReports, usePlayerState } from "../store";
import type { NowPlaying, PlayerState, PlayerTrack } from "../types";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function qualityOf(track: PlayerTrack, now: NowPlaying, outputSampleRateHz: number | null) {
  const { rendition } = now;
  return describeQuality(
    track.source,
    {
      tier: now.tier,
      codec: rendition.codec,
      sampleRateHz: rendition.sampleRateHz,
      bitDepth: rendition.bitDepth,
      bitrateKbps: rendition.nominalKbps,
    },
    outputSampleRateHz ? { outputSampleRateHz } : {},
  );
}

function Icon({ name }: { name: "play" | "pause" | "next" | "previous" }) {
  const paths = {
    play: "M7 4.5v15l12-7.5z",
    pause: "M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z",
    next: "M5 5v14l9-7zM16 5h3v14h-3z",
    previous: "M19 5v14l-9-7zM5 5h3v14H5z",
  };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

/** Line icons for the mode buttons (stroke, square caps - the icon style of the design system). */
function LineIcon({ name }: { name: "shuffle" | "repeat" | "repeatOne" | "queue" | "close" }) {
  const paths = {
    shuffle:
      "M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.4M13 10.4C13.9 8.6 15 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5",
    repeat:
      "M5 11V9a2 2 0 0 1 2-2h11M15.5 4.5 18 7l-2.5 2.5M19 13v2a2 2 0 0 1-2 2H6M8.5 19.5 6 17l2.5-2.5",
    repeatOne:
      "M5 11V9a2 2 0 0 1 2-2h11M15.5 4.5 18 7l-2.5 2.5M19 13v2a2 2 0 0 1-2 2H6M8.5 19.5 6 17l2.5-2.5M11.5 10.5 12.5 10v4.5",
    queue: "M4 6h12M4 11h12M4 16h7M15 15.5v4l4-2z",
    close: "M6 6l12 12M18 6L6 18",
  };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** What plays next: tap an item to play it, remove the ones you don't want. */
function QueueMenu({ state }: { state: PlayerState }) {
  const t = useTranslations("Player");
  const player = getPlayer();
  const upcoming = state.queue
    .map((track, index) => ({ track, index }))
    .slice(state.index + 1, state.index + 51);
  const more = state.queue.length - state.index - 1 - upcoming.length;
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
          <p className="queue-menu__label">{t("upNext")}</p>
          {upcoming.length ? (
            <ol className="queue-menu__list">
              {upcoming.map(({ track, index }) => (
                <li key={`${index}:${track.id}`} className="queue-menu__item">
                  <button
                    type="button"
                    className="queue-menu__play"
                    onClick={() => void player.playAt(index)}
                  >
                    <span className="queue-menu__title">{track.title}</span>
                    <span className="queue-menu__artist">{track.artist}</span>
                  </button>
                  <button
                    type="button"
                    className="player-button"
                    onClick={() => player.removeFromQueue(index)}
                    aria-label={t("removeFromQueue", { title: track.title })}
                  >
                    <LineIcon name="close" />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="field__hint">
              {state.repeat === "all" ? t("queueRepeats") : t("queueEmpty")}
            </p>
          )}
          {more > 0 ? <p className="field__hint">{t("queueMore", { count: more })}</p> : null}
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

function QualityChip({ quality, now }: { quality: QualityDescription; now: NowPlaying }) {
  const t = useTranslations("Player");
  const label =
    quality.kind === "hires"
      ? t("quality.hires")
      : quality.kind === "lossless"
        ? t("quality.lossless")
        : t(`quality.${now.tier === "data_saver" ? "dataSaver" : "high"}`);
  const output = quality.outputText
    ? ` · ${t("quality.output", { rate: quality.outputText })}`
    : "";
  const full = t("quality.full", {
    source: quality.sourceText,
    delivered: quality.deliveredText,
    label,
  });
  const reason = now.reasons[0];
  return (
    <p className="player-bar__quality" title={full + output}>
      <span className={`quality-chip quality-chip--${quality.kind}`}>
        <span aria-hidden="true">{label}</span>
        <span className="visually-hidden">{full + output}</span>
      </span>
      <span className="player-bar__spec" aria-hidden="true">
        {quality.deliveredText}
        {output}
      </span>
      {reason ? <span className="player-bar__reason">{t(`reason.${reason}`)}</span> : null}
    </p>
  );
}

/**
 * Persistent player in the shell. With an empty queue it shows the honest idle state - no fake
 * track, no dead controls.
 */
/**
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
          disabled={state.index >= state.queue.length - 1 && state.repeat !== "all"}
          aria-label={t("next")}
        >
          <Icon name="next" />
        </button>
      </div>

      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variant of the cover
        <img className="player-bar__cover" src={cover.url} alt="" width={48} height={48} />
      ) : (
        <span className="player-bar__cover" aria-hidden="true" />
      )}
      <div className="player-bar__now">
        <p className="player-bar__title" aria-live="polite">
          {state.clip ? <span className="player-bar__soundcheck">{t("soundcheck")}</span> : null}
          <span className="player-bar__track">{track.title}</span>
          <span className="player-bar__artist">{track.artist}</span>
        </p>
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
    </section>
  );
}
