"use client";

import { describeQuality, type QualityDescription } from "@tunewick/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getPlayer, startListeningReports, usePlayerState } from "../store";
import type { NowPlaying, PlayerTrack } from "../types";

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
 * Persistent player in the shell. With an empty queue it shows the honest idle state — no fake
 * track, no dead controls.
 */
/** `reportListens`: keep a listening history for the signed-in listener. */
export function PlayerBar({ reportListens = false }: { reportListens?: boolean }) {
  const t = useTranslations("Player");
  const state = usePlayerState();
  useEffect(() => {
    if (reportListens) startListeningReports();
  }, [reportListens]);
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
          disabled={state.index >= state.queue.length - 1}
          aria-label={t("next")}
        >
          <Icon name="next" />
        </button>
      </div>

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
