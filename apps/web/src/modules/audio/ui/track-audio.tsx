"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
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

export function TrackAudioUpload({
  trackId,
  trackTitle,
  audio,
  available,
}: {
  trackId: string;
  trackTitle: string;
  audio: TrackAudio | null;
  available: boolean;
}) {
  const t = useTranslations("Audio");
  const format = useFormatter();
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "finishing";

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

  const size = audio
    ? format.number(audio.sizeBytes / 1024 ** 2, { maximumFractionDigits: 1 })
    : "";

  return (
    <div className="track-audio">
      {audio ? (
        <p className={`track-audio__status track-audio__status--${audio.status}`} role="status">
          {t(`status.${audio.status}`, { file: audio.fileName, size })}
          {audio.status === "rejected" && audio.rejectionMessage
            ? ` ${audio.rejectionMessage}`
            : ""}
        </p>
      ) : (
        <p className="track-audio__status field__hint">{t("none")}</p>
      )}

      <div className="track-audio__row">
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
