"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** The phone's share sheet where there is one; elsewhere the link goes to the clipboard. */
export function SharePlaylistButton({ url, title }: { url: string; title: string }) {
  const t = useTranslations("Playlists");
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);
  async function share() {
    setStatus(null);
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return; // closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <>
      <button type="button" className="button" onClick={() => void share()}>
        {t("share")}
      </button>
      {status ? (
        <span role="status" className="field__hint">
          {status === "copied" ? t("shareCopied") : t("shareFailed")}
        </span>
      ) : null}
    </>
  );
}
