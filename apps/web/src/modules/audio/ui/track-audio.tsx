"use client";

import { formatSampleRate } from "@tunewick/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { getPlayer, type PlayerTrack } from "@/modules/player";
import { abandonAudioUpload, finishAudioUpload, startAudioUpload } from "../actions";
import type { TrackAudio } from "../queries";
import { checkMasterFile, MASTER_ACCEPT, type UploadError } from "../validation";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "finishing" }
  | { kind: "error"; error: UploadError };

/** PUT with progress events (fetch has no upload progress). */
function put(url: string, file: File, onProgress: (percent: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => resolve(request.status >= 200 && request.status < 300));
    request.addEventListener("error", () => resolve(false));
    request.addEventListener("abort", () => resolve(false));
    request.send(file);
  });
}

const TIER_NAMES: Record<string, string> = {
  data_saver: "Data Saver",
  high: "High",
  lossless: "Lossless",
  hires: "Hi-Res",
};

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function sourceName(source: NonNullable<TrackAudio["source"]>) {
  const name = ["wav", "aiff"].includes(source.container) ? source.container : source.codec;
  return `${name.toUpperCase()} ${source.bits}/${formatSampleRate(source.sampleRate)}`;
}

const PREVIEW_MS = 30_000;

/**
 * The track at a glance with the suggested preview highlighted. Decorative: the same facts are in
 * the text next to it.
 */
function Waveform({
  peaks,
  durationMs,
  startMs,
}: {
  peaks: number[];
  durationMs: number;
  startMs: number | null;
}) {
  const from = startMs === null ? -1 : (startMs / durationMs) * peaks.length;
  const to = startMs === null ? -1 : ((startMs + PREVIEW_MS) / durationMs) * peaks.length;
  return (
    <svg
      className="track-audio__wave"
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {peaks.map((peak, i) => (
        <rect
          key={i}
          x={i + 0.15}
          width={0.7}
          y={50 - Math.max(peak, 2) / 2}
          height={Math.max(peak, 2)}
          className={i >= from && i < to ? "is-preview" : undefined}
        />
      ))}
    </svg>
  );
}

/** What the worker found, in plain words: source format, length, loudness, versions, caveats. */
export function AcceptedDetails({ audio }: { audio: TrackAudio }) {
  const t = useTranslations("Audio");
  const format = useFormatter();
  const facts = [
    audio.source ? sourceName(audio.source) : null,
    audio.durationMs ? formatDuration(audio.durationMs) : null,
    audio.integratedLufs !== null
      ? `${format.number(audio.integratedLufs, { maximumFractionDigits: 1 })} LUFS`
      : null,
  ].filter(Boolean);
  return (
    <>
      <p className="track-audio__facts">{facts.join(" · ")}</p>
      {audio.tiers.length ? (
        <p className="field__hint">
          {t("versions", { list: audio.tiers.map((tier) => TIER_NAMES[tier] ?? tier).join(", ") })}
        </p>
      ) : null}
      {audio.lossyOrigin ? <p className="track-audio__note">{t("note.lossy")}</p> : null}
      {audio.upsampledFrom ? (
        <p className="track-audio__note">
          {t("note.upsampled", { rate: formatSampleRate(audio.upsampledFrom) })}
        </p>
      ) : null}
      {audio.bitPadded ? <p className="track-audio__note">{t("note.padded")}</p> : null}
      {audio.waveform.length && audio.durationMs ? (
        <Waveform
          peaks={audio.waveform}
          durationMs={audio.durationMs}
          startMs={audio.bestMomentMs}
        />
      ) : null}
      {/* A short track previews from the start: nothing to suggest. */}
      {audio.bestMomentMs ? (
        <p className="field__hint">
          {t("bestMoment", { start: formatDuration(audio.bestMomentMs) })}
        </p>
      ) : null}
    </>
  );
}

export function TrackAudioUpload({
  trackId,
  trackTitle,
  audio,
  available,
  preview,
}: {
  trackId: string;
  trackTitle: string;
  audio: TrackAudio | null;
  available: boolean;
  /** Processed tracks of this release and this track's position among them. */
  preview?: { tracks: PlayerTrack[]; index: number };
}) {
  const t = useTranslations("Audio");
  const format = useFormatter();
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "finishing";
  const waiting = audio?.status === "uploaded" || audio?.status === "processing";

  // While the worker has the file, refresh so "ready"/"rejected" appears without a reload.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  async function upload(file: File) {
    const problem = checkMasterFile(file.name, file.size);
    if (problem) return setPhase({ kind: "error", error: problem });

    setPhase({ kind: "uploading", percent: 0 });
    const started = await startAudioUpload(trackId, file.name, file.size);
    if (!started.ok) return setPhase({ kind: "error", error: started.error });

    const sent = await put(started.url, file, (percent) =>
      setPhase({ kind: "uploading", percent }),
    );
    if (!sent) {
      await abandonAudioUpload(started.uploadId);
      return setPhase({ kind: "error", error: "transfer" });
    }

    setPhase({ kind: "finishing" });
    const finished = await finishAudioUpload(started.uploadId);
    if (!finished.ok) return setPhase({ kind: "error", error: finished.error });
    setPhase({ kind: "idle" });
    if (input.current) input.current.value = "";
    router.refresh();
  }

  if (!available) {
    return <p className="track-audio__status field__hint">{t("unavailable")}</p>;
  }

  function rejectionText(rejected: TrackAudio) {
    // Codes come from the worker; unknown ones fall back to its (English) message.
    const key = `rejection.${rejected.rejectionCode}` as "rejection.duration";
    if (rejected.rejectionCode && t.has(key)) return t(key);
    return rejected.rejectionMessage ?? "";
  }

  const size = audio
    ? format.number(audio.sizeBytes / 1024 ** 2, { maximumFractionDigits: 1 })
    : "";

  return (
    <div className="track-audio">
      {audio ? (
        <p className={`track-audio__status track-audio__status--${audio.status}`} role="status">
          {t(`status.${audio.status}`, { file: audio.fileName, size })}
          {audio.status === "rejected" ? ` ${rejectionText(audio)}` : ""}
        </p>
      ) : (
        <p className="track-audio__status field__hint">{t("none")}</p>
      )}

      {audio?.status === "accepted" ? <AcceptedDetails audio={audio} /> : null}

      <div className="track-audio__row">
        {preview && audio?.status === "accepted" ? (
          <button
            type="button"
            className="button button--quiet"
            aria-label={`${t("listen")}: ${trackTitle}`}
            onClick={() => {
              const player = getPlayer();
              player.configure({ setting: "auto", entitlement: "hires" });
              void player.playQueue(preview.tracks, preview.index);
            }}
          >
            {t("listen")}
          </button>
        ) : null}
        <label htmlFor={inputId} className={`button button--quiet${busy ? " is-disabled" : ""}`}>
          {audio ? t("replace") : t("choose")}
          <span className="visually-hidden">{`: ${trackTitle}`}</span>
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={MASTER_ACCEPT}
          className="visually-hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {phase.kind === "uploading" ? (
          <span className="track-audio__progress">
            <progress max={100} value={phase.percent} aria-label={t("progressLabel")} />
            <span aria-live="polite">{t("uploading", { percent: phase.percent })}</span>
          </span>
        ) : null}
        {phase.kind === "finishing" ? <span aria-live="polite">{t("finishing")}</span> : null}
      </div>

      {phase.kind === "error" ? (
        <p className="form-error" role="alert">
          {t(`error.${phase.error}`)}
        </p>
      ) : null}
      <p className="field__hint">{t("hint")}</p>
    </div>
  );
}
