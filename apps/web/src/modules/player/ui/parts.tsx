"use client";

import { describeQuality, type QualityDescription } from "@tunewick/shared";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { getPlayer } from "../store";
import type { NowPlaying, PlayerState, PlayerTrack } from "../types";

// Pieces shared by the player bar and the full-screen player.

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function qualityOf(track: PlayerTrack, now: NowPlaying, outputSampleRateHz: number | null) {
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

export function Icon({ name }: { name: "play" | "pause" | "next" | "previous" }) {
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
export function LineIcon({
  name,
}: {
  name: "shuffle" | "repeat" | "repeatOne" | "queue" | "close" | "collapse";
}) {
  const paths = {
    shuffle:
      "M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.4M13 10.4C13.9 8.6 15 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5",
    repeat:
      "M5 11V9a2 2 0 0 1 2-2h11M15.5 4.5 18 7l-2.5 2.5M19 13v2a2 2 0 0 1-2 2H6M8.5 19.5 6 17l2.5-2.5",
    repeatOne:
      "M5 11V9a2 2 0 0 1 2-2h11M15.5 4.5 18 7l-2.5 2.5M19 13v2a2 2 0 0 1-2 2H6M8.5 19.5 6 17l2.5-2.5M11.5 10.5 12.5 10v4.5",
    queue: "M4 6h12M4 11h12M4 16h7M15 15.5v4l4-2z",
    close: "M6 6l12 12M18 6L6 18",
    collapse: "M6 9l6 6 6-6",
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

/** Next is possible: a following track, the queue starting over, or autoplay bringing more. */
export function canGoNext(state: PlayerState) {
  return (
    state.index < state.queue.length - 1 ||
    state.repeat === "all" ||
    (state.autoplay && state.repeat === "off" && !state.clip)
  );
}

export function QueueList({ items }: { items: { track: PlayerTrack; index: number }[] }) {
  const t = useTranslations("Player");
  const player = getPlayer();
  return (
    <ol className="queue-menu__list">
      {items.map(({ track, index }) => (
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
  );
}

/**
 * What plays next: tap an item to play it, remove the ones you don't want. Songs autoplay added
 * come in their own section, below the listener's own, with the autoplay switch.
 */
export function QueueContents({ state }: { state: PlayerState }) {
  const t = useTranslations("Player");
  const player = getPlayer();
  const id = useId();
  const upcoming = state.queue
    .map((track, index) => ({ track, index }))
    .slice(state.index + 1, state.index + 51);
  const more = state.queue.length - state.index - 1 - upcoming.length;
  const mine = upcoming.filter(({ track }) => !track.autoplay);
  const mixed = upcoming.filter(({ track }) => track.autoplay);
  return (
    <>
      {mine.length || !mixed.length ? <p className="queue-menu__label">{t("upNext")}</p> : null}
      {mine.length ? (
        <QueueList items={mine} />
      ) : mixed.length ? null : (
        <p className="field__hint">
          {state.repeat === "all"
            ? t("queueRepeats")
            : state.autoplay && state.repeat === "off"
              ? t("autoplayNext")
              : t("queueEmpty")}
        </p>
      )}
      {mixed.length ? (
        <>
          <p className="queue-menu__label">{t("autoplayLabel")}</p>
          <QueueList items={mixed} />
        </>
      ) : null}
      {more > 0 ? <p className="field__hint">{t("queueMore", { count: more })}</p> : null}
      <label className="queue-menu__switch">
        <span>
          <span className="queue-menu__title" id={`${id}-autoplay`}>
            {t("autoplay")}
          </span>
          <span className="queue-menu__artist" id={`${id}-autoplay-hint`}>
            {t("autoplayHint")}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-labelledby={`${id}-autoplay`}
          aria-describedby={`${id}-autoplay-hint`}
          className="field__checkbox"
          checked={state.autoplay}
          onChange={() => player.toggleAutoplay()}
        />
      </label>
    </>
  );
}

export function QualityChip({ quality, now }: { quality: QualityDescription; now: NowPlaying }) {
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
