"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { countryName, flagEmoji } from "@/lib/intl";
import { reportPoints } from "@/modules/notices";
import { getPlayer } from "@/modules/player";
import { getFullPlayback, setFeedReaction, setTrackSaved } from "../actions";
import type { PreviewState } from "../preview-player";
import type { FeedItem } from "../types";
import { Icon } from "./icons";
import { ShareButton } from "./share-button";
import { ToggleAction } from "./toggle-action";
import { WhyPanel } from "./why";

function useReason(item: FeedItem) {
  const t = useTranslations("Feed.reason");
  const locale = useLocale();
  const { reason } = item;
  const genre =
    item.genres.find((g) => g.id === reason.genreId)?.name ?? item.genres[0]?.name ?? "";
  const country = reason.countryCode ? countryName(reason.countryCode, locale) : "";
  switch (reason.code) {
    case "followed_artist":
    case "artist_spotlight":
      return t(reason.code, { artist: item.artist.name });
    case "genre_you_like":
    case "new_genre":
      return genre ? t(reason.code, { genre }) : t("wildcard");
    case "near_you":
    case "new_country":
      return country ? t(reason.code, { country }) : t("wildcard");
    case "similar_to":
      return t("similar_to", { title: reason.title ?? "" });
    case "weekly_drop":
      return t("weekly_drop", { section: reason.section ?? "" });
    default:
      return t(reason.code);
  }
}

/** One feed card: artwork, who and where from, why it is here, the preview and what to do next. */
export function FeedCard({
  item,
  index,
  count,
  active,
  preview,
  started,
  onToggle,
  onNext,
  onEvent,
  signedIn,
}: {
  item: FeedItem;
  index: number;
  count: number;
  active: boolean;
  preview: PreviewState | null;
  started: boolean;
  onToggle: () => void;
  onNext?: () => void;
  onEvent: (name: string) => void;
  signedIn: boolean;
}) {
  const t = useTranslations("Feed");
  const tLibrary = useTranslations("Library.actions");
  const locale = useLocale();
  const reason = useReason(item);
  const [menuOpen, setMenuOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [fullPending, startFull] = useTransition();
  const [fullFailed, setFullFailed] = useState(false);

  const status = preview?.status ?? "idle";
  const playing = status === "playing" || status === "loading";
  const progress = preview && preview.length ? preview.position / preview.length : 0;
  const unavailable = item.preview.sources.length === 0;
  const place = [item.city, item.countryCode ? countryName(item.countryCode, locale) : null]
    .filter(Boolean)
    .join(", ");

  const playFull = () =>
    startFull(async () => {
      setFullFailed(false);
      const playback = await getFullPlayback(item.trackId);
      if (!playback) {
        setFullFailed(true);
        return;
      }
      const player = getPlayer();
      player.configure({ setting: "auto", entitlement: playback.entitlement });
      onEvent("song_played");
      await player.playQueue(playback.tracks, playback.index);
    });

  const background = item.cover?.color ?? "var(--bg-raised)";

  return (
    <article
      className="feed-card"
      data-index={index}
      data-active={active || undefined}
      aria-roledescription={t("card")}
      aria-label={t("position", {
        index: index + 1,
        count,
        title: item.title,
        artist: item.artist.name,
      })}
      style={{ "--card-tint": background } as React.CSSProperties}
    >
      <div className="feed-card__backdrop" aria-hidden="true">
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants
          <img
            src={item.cover.src}
            alt=""
            loading={index < 2 ? "eager" : "lazy"}
            decoding="async"
          />
        ) : null}
      </div>

      <div className="feed-card__body">
        <button
          type="button"
          className={
            item.exploration ? "feed-card__reason feed-card__reason--explore" : "feed-card__reason"
          }
          aria-expanded={whyOpen}
          aria-controls={`why-${item.trackId}`}
          onClick={() => setWhyOpen((open) => !open)}
        >
          <Icon name="spark" size={14} />
          <span>{reason}</span>
          <span className="feed-card__why-hint">{t("why")}</span>
        </button>
        {whyOpen ? <WhyPanel id={`why-${item.trackId}`} lines={item.why} /> : null}

        <button
          type="button"
          className="feed-card__art"
          onClick={onToggle}
          disabled={unavailable}
          aria-label={
            playing
              ? t("pausePreview", { title: item.title })
              : t("playPreview", { title: item.title })
          }
        >
          <span
            className="artwork feed-card__cover"
            style={item.cover?.color ? { backgroundColor: item.cover.color } : undefined}
          >
            {item.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variants
              <img
                src={item.cover.src}
                srcSet={item.cover.srcSet}
                sizes="(min-width: 768px) 24rem, 80vw"
                alt=""
                width={item.cover.width}
                height={item.cover.width}
                loading={index < 2 ? "eager" : "lazy"}
                decoding="async"
              />
            ) : (
              <span className="feed-card__monogram" aria-hidden="true">
                {item.artist.name.slice(0, 1)}
              </span>
            )}
            <span className="feed-card__play" data-state={status} aria-hidden="true">
              <Icon name={playing ? "pause" : "play"} size={28} />
            </span>
            {!started && active && !unavailable ? (
              <span className="feed-card__start" aria-hidden="true">
                {t("start")}
              </span>
            ) : null}
          </span>
        </button>

        <div
          className="feed-card__progress"
          role="progressbar"
          aria-label={t("previewProgress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        {unavailable ? <p className="feed-card__note">{t("previewUnavailable")}</p> : null}
        {status === "blocked" ? <p className="feed-card__note">{t("tapToPlay")}</p> : null}
        {status === "unsupported" ? (
          <p className="feed-card__note">{t("previewUnsupported")}</p>
        ) : null}
        {status === "error" && !unavailable ? (
          <p className="feed-card__note">{t("previewError")}</p>
        ) : null}

        <header className="feed-card__info">
          <h2 className="feed-card__title">
            {item.title}
            {item.explicit ? (
              <abbr className="release-tracks__explicit" title={t("explicit")}>
                E
              </abbr>
            ) : null}
          </h2>
          <p className="feed-card__artist">
            <Link
              href={{ pathname: "/artists/[slug]", params: { slug: item.artist.slug } }}
              onClick={() => onEvent("artist_opened")}
            >
              {item.artist.name}
            </Link>
            {item.artist.verified ? (
              <span className="feed-card__verified" title={t("verified")}>
                <Icon name="check" size={14} />
                <span className="visually-hidden">{t("verified")}</span>
              </span>
            ) : null}
          </p>
          <p className="feed-card__meta">
            {item.countryCode ? (
              <span>
                <span aria-hidden="true">{flagEmoji(item.countryCode)} </span>
                {place}
              </span>
            ) : null}
            {item.genres.slice(0, 2).map((g) => (
              <span key={g.id} className="feed-card__genre">
                {g.name}
              </span>
            ))}
          </p>
          <p className="feed-card__release">
            <Link
              href={{
                pathname: "/artists/[slug]/releases/[release]",
                params: { slug: item.artist.slug, release: item.release.slug },
              }}
            >
              {t("fromRelease", { title: item.release.title })}
            </Link>
            {item.preview.chosen ? (
              <span className="feed-card__chosen"> · {t("chosenExcerpt")}</span>
            ) : null}
          </p>
        </header>

        <div className="feed-card__actions">
          {signedIn && item.liked !== null ? (
            <ToggleAction
              initial={item.liked}
              icon="heart"
              label={tLibrary("like", { name: item.title })}
              activeLabel={tLibrary("unlike", { name: item.title })}
              text={tLibrary("likeShort")}
              activeText={tLibrary("liked")}
              failedText={tLibrary("failed")}
              onToggle={(on) => setFeedReaction("like", item.trackId, on)}
              onChanged={(on) => on && onEvent("song_liked")}
            />
          ) : null}
          {signedIn && item.saved !== null ? (
            <ToggleAction
              initial={item.saved}
              icon="save"
              label={t("saveLabel", { title: item.title })}
              activeLabel={t("unsave", { title: item.title })}
              text={t("save")}
              activeText={t("saved")}
              failedText={tLibrary("failed")}
              onToggle={async (on) => {
                const result = await setTrackSaved(item.trackId, on);
                if (result.ok && result.on) reportPoints(result.points, "save");
                return result;
              }}
              onChanged={(on) => on && onEvent("song_saved")}
            />
          ) : null}
          {signedIn && item.following !== null ? (
            <ToggleAction
              initial={item.following}
              icon="plus"
              activeIcon="check"
              label={tLibrary("follow", { name: item.artist.name })}
              activeLabel={tLibrary("unfollow", { name: item.artist.name })}
              text={tLibrary("followShort")}
              activeText={tLibrary("following")}
              failedText={tLibrary("failed")}
              onToggle={(on) => setFeedReaction("follow", item.artist.id, on)}
              onChanged={(on) => on && onEvent("artist_followed")}
            />
          ) : null}
          {!signedIn ? (
            <Link href="/login" className="feed-action">
              <Icon name="heart" />
              <span className="feed-action__label">{t("signInToSave")}</span>
            </Link>
          ) : null}
          <ShareButton
            song={{
              trackId: item.trackId,
              code: item.code,
              title: item.title,
              artistName: item.artist.name,
              artistSlug: item.artist.slug,
            }}
          />
          <div className="feed-menu">
            <button
              type="button"
              className="feed-action"
              aria-expanded={menuOpen}
              aria-label={t("more", { title: item.title })}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Icon name="more" />
              <span className="feed-action__label" aria-hidden="true">
                {t("moreShort")}
              </span>
            </button>
            {menuOpen ? (
              <div className="feed-menu__panel">
                <Link
                  className="feed-menu__item"
                  href={{ pathname: "/", query: { similar: item.code } }}
                >
                  {t("similar")}
                </Link>
                <Link
                  className="feed-menu__item"
                  href={{ pathname: "/", query: { artist: item.artist.slug } }}
                >
                  {t("discoverArtist", { artist: item.artist.name })}
                </Link>
                {signedIn ? (
                  <Link
                    className="feed-menu__item"
                    href={{ pathname: "/report", query: { typ: "release", id: item.release.id } }}
                  >
                    {t("report")}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="feed-card__footer">
          <button
            type="button"
            className="button feed-card__full"
            onClick={playFull}
            disabled={fullPending}
            aria-busy={fullPending}
          >
            <Icon name="full" size={18} /> {t("playFull")}
          </button>
          {fullFailed ? (
            <span role="alert" className="field__error">
              {t("fullUnavailable")}
            </span>
          ) : null}
          {onNext ? (
            <button
              type="button"
              className="feed-card__next"
              onClick={onNext}
              aria-label={t("next")}
            >
              <Icon name="down" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
