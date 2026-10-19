"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { removeBanner, removePlaylistCover } from "../actions";

/** Removes a listener's or artist's own art (a banner or a playlist cover). */
export function RemoveImageButton({
  kind,
  ownerId,
}: {
  kind: "banner" | "playlist_cover";
  ownerId: string;
}) {
  const t = useTranslations("Images");
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="button button--quiet"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(() => (kind === "banner" ? removeBanner(ownerId) : removePlaylistCover(ownerId)))
      }
    >
      {t(kind === "banner" ? "banner.remove" : "playlistCover.remove")}
    </button>
  );
}
