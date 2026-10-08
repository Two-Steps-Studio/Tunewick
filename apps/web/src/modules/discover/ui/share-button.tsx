"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { reportPoints } from "@/modules/notices";
import { Icon } from "./icons";

export interface Shareable {
  trackId: string;
  code: string;
  title: string;
  artistName: string;
  artistSlug: string;
}

export function songUrl(song: Shareable, locale: Locale) {
  const path = getPathname({
    href: {
      pathname: "/song/[artist]/[song]",
      params: { artist: song.artistSlug, song: songSegment(song.title, song.code, slugify) },
    },
    locale,
  });
  return `${window.location.origin}${path}`;
}

async function recordShare(trackId: string, channel: "native" | "copy" | "card") {
  try {
    const response = await fetch("/api/discover/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId, channel }),
    });
    if (response.ok) reportPoints(((await response.json()) as { points: number }).points, "share");
  } catch {}
}

/**
 * Share a song: the system share sheet where there is one (TikTok, Instagram, Discord… are the
 * listener's own apps), otherwise copy the link. Vertical and square cards for stories and posts.
 */
export function ShareButton({
  song,
  variant = "action",
}: {
  song: Shareable;
  variant?: "action" | "button";
}) {
  const t = useTranslations("Feed");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const shareLink = async () => {
    const url = songUrl(song, locale);
    const text = t("shareText", { title: song.title, artist: song.artistName });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: song.title, text, url });
        setOpen(false);
        void recordShare(song.trackId, "native");
      } catch {
        // Cancelled by the listener: nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      void recordShare(song.trackId, "copy");
    } catch {
      window.prompt(t("copyPrompt"), url);
    }
  };

  const card = (format: "story" | "square") =>
    `/api/cards/song/${song.code}?format=${format}&locale=${locale}`;

  return (
    <div className="share-menu" ref={menu}>
      <button
        type="button"
        className={variant === "action" ? "feed-action" : "button"}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={variant === "action" ? t("shareLabel", { title: song.title }) : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="share" />
        <span className={variant === "action" ? "feed-action__label" : undefined}>
          {t("share")}
        </span>
      </button>
      {open ? (
        <div
          className="share-menu__panel"
          role="group"
          aria-label={t("shareLabel", { title: song.title })}
        >
          <button type="button" className="share-menu__item" onClick={() => void shareLink()}>
            {copied ? t("copied") : t("shareLink")}
          </button>
          <a
            className="share-menu__item"
            href={card("story")}
            target="_blank"
            rel="noopener"
            download={`tunewick-${song.code}-story.png`}
            onClick={() => void recordShare(song.trackId, "card")}
          >
            {t("cardStory")}
          </a>
          <a
            className="share-menu__item"
            href={card("square")}
            target="_blank"
            rel="noopener"
            download={`tunewick-${song.code}.png`}
            onClick={() => void recordShare(song.trackId, "card")}
          >
            {t("cardSquare")}
          </a>
        </div>
      ) : null}
      <span className="visually-hidden" role="status">
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}
