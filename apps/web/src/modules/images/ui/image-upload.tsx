"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { abandonImageUpload, finishImageUpload, startImageUpload } from "../actions";
import type { ImageUploadState } from "../queries";
import { checkImageFile, IMAGE_ACCEPT, type ImageKind, type ImageUploadError } from "../validation";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "finishing" }
  | { kind: "error"; error: ImageUploadError };

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

/** Upload of a cover or an artist photo, with the honest processing status. */
export function ImageUpload({
  kind,
  ownerId,
  hasImage,
  latest,
}: {
  kind: ImageKind;
  ownerId: string;
  /** An image is attached already (the button then says "replace"). */
  hasImage: boolean;
  latest: ImageUploadState | null;
}) {
  const t = useTranslations("Images");
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "finishing";
  const waiting = latest?.status === "uploaded" || latest?.status === "processing";
  const label = kind === "release_artwork" ? "cover" : "photo";

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  async function upload(file: File) {
    const problem = checkImageFile(file.name, file.size);
    if (problem) return setPhase({ kind: "error", error: problem });
    setPhase({ kind: "uploading", percent: 0 });
    const started = await startImageUpload(kind, ownerId, file.name, file.size);
    if (!started.ok) return setPhase({ kind: "error", error: started.error });
    const sent = await put(started.url, file, (percent) =>
      setPhase({ kind: "uploading", percent }),
    );
    if (!sent) {
      await abandonImageUpload(started.imageId);
      return setPhase({ kind: "error", error: "transfer" });
    }
    setPhase({ kind: "finishing" });
    const finished = await finishImageUpload(started.imageId);
    if (!finished.ok) return setPhase({ kind: "error", error: finished.error });
    setPhase({ kind: "idle" });
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function statusText() {
    if (!latest) return null;
    if (waiting) return t(`${label}.processing`);
    if (latest.status === "rejected") {
      const key = `rejection.${latest.rejectionCode}` as "rejection.too_small";
      const reason = latest.rejectionCode && t.has(key) ? t(key) : t("rejection.unreadable");
      return `${t(`${label}.rejected`)} ${reason}`;
    }
    if (latest.status === "failed" || latest.status === "pending") return t(`${label}.failed`);
    return null;
  }
  const status = statusText();

  return (
    <div className="image-upload">
      {status ? (
        <p
          className={`track-audio__status track-audio__status--${latest?.status ?? "pending"}`}
          role="status"
        >
          {status}
        </p>
      ) : null}
      <div className="track-audio__row">
        <label htmlFor={inputId} className={`button button--quiet${busy ? " is-disabled" : ""}`}>
          {hasImage ? t(`${label}.replace`) : t(`${label}.choose`)}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
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
      <p className="field__hint">{t(`${label}.hint`)}</p>
    </div>
  );
}
