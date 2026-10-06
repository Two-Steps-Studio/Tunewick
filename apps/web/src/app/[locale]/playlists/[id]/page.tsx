import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPlayableQueue, listenerEntitlement } from "@/modules/audio";
import { getOptionalUser } from "@/modules/auth";
import {
  DeletePlaylistButton,
  deletePlaylist,
  getPlaylist,
  movePlaylistItem,
  PlaylistEditForm,
  removePlaylistItem,
} from "@/modules/playlists";
import { PlayButton, type PlayerTrack } from "@/modules/player";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = PageProps<"/[locale]/playlists/[id]">["params"];

async function load(params: Params) {
  const { id } = await params;
  return UUID.test(id) ? getPlaylist(id) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load(params);
  if (!data) return {};
  // Only public playlists may be indexed; unlisted ones are for whoever has the link.
  return {
    title: data.playlist.title,
    robots: data.playlist.visibility === "public" ? undefined : { index: false },
  };
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function PlaylistPage({ params }: PageProps<"/[locale]/playlists/[id]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const data = await load(params);
  if (!data) notFound();

  const { playlist, owner, items, hidden } = data;
  const t = await getTranslations("Playlists");
  const user = await getOptionalUser();
  const mine = user?.id === playlist.owner_id;
  const entitlement = await listenerEntitlement();
  const playable = await getPlayableQueue(
    items.map((item) => ({
      id: item.track.id,
      title: item.track.title,
      releaseId: item.track.release.id,
      artistName: item.track.release.artist.name,
    })),
    entitlement,
  );
  const queue = playable.filter((track): track is PlayerTrack => track !== null);
  // Position in the queue for each item (null when that item cannot be played).
  let next = 0;
  const queueIndex = playable.map((track) => (track ? next++ : null));
  const ownerName = owner?.display_name ?? (owner?.handle ? `@${owner.handle}` : null);

  return (
    <article className="release-page">
      <header className="playlist-head">
        <p className="artist-badge">
          {t("badge")} · {t(`visibility.${playlist.visibility}`)}
        </p>
        <h1 className="release-page__title">{playlist.title}</h1>
        {ownerName ? (
          <p className="release-page__artist">
            {owner?.handle ? (
              <Link href={{ pathname: "/profile/[handle]", params: { handle: owner.handle } }}>
                {ownerName}
              </Link>
            ) : (
              ownerName
            )}
          </p>
        ) : null}
        {playlist.description ? <p className="profile__bio">{playlist.description}</p> : null}
        <p className="release-page__meta">
          {t("trackCount", { count: items.length })}
          {hidden ? ` · ${t("hidden", { count: hidden })}` : ""}
        </p>
        {queue.length ? (
          <PlayButton
            tracks={queue}
            index={0}
            entitlement={entitlement}
            label={t("playAll", { title: playlist.title })}
            className="button button--primary"
          >
            {t("play")}
          </PlayButton>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="field__hint">{mine ? t("emptyMine") : t("empty")}</p>
      ) : (
        <ol className="release-tracks">
          {items.map((item, i) => {
            const index = queueIndex[i];
            return (
              <li
                key={item.id}
                className={
                  mine
                    ? "release-tracks__item playlist-item playlist-item--edit"
                    : "release-tracks__item playlist-item"
                }
              >
                <span className="release-tracks__number">{i + 1}</span>
                <span className="release-tracks__title">
                  {item.track.title}
                  <span className="library-track__by">
                    <Link
                      href={{
                        pathname: "/artists/[slug]",
                        params: { slug: item.track.release.artist.slug },
                      }}
                    >
                      {item.track.release.artist.name}
                    </Link>
                    {" · "}
                    <Link
                      href={{
                        pathname: "/artists/[slug]/releases/[release]",
                        params: {
                          slug: item.track.release.artist.slug,
                          release: item.track.release.slug,
                        },
                      }}
                    >
                      {item.track.release.title}
                    </Link>
                  </span>
                </span>
                <span className="release-tracks__duration">
                  {item.track.duration_ms ? formatDuration(item.track.duration_ms) : ""}
                </span>
                {index !== null && index !== undefined ? (
                  <PlayButton
                    tracks={queue}
                    index={index}
                    entitlement={entitlement}
                    label={t("playTrack", { title: item.track.title })}
                    className="player-button release-tracks__play"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                    </svg>
                  </PlayButton>
                ) : (
                  <span />
                )}
                {mine ? (
                  <span className="playlist-item__tools">
                    <form action={movePlaylistItem.bind(null, item.id, i - 1)}>
                      <button
                        type="submit"
                        className="player-button"
                        disabled={i === 0}
                        aria-label={t("moveUp", { title: item.track.title, position: i + 1 })}
                      >
                        <Icon d="M12 19V5M6 11l6-6 6 6" />
                      </button>
                    </form>
                    <form action={movePlaylistItem.bind(null, item.id, i + 1)}>
                      <button
                        type="submit"
                        className="player-button"
                        disabled={i === items.length - 1}
                        aria-label={t("moveDown", { title: item.track.title, position: i + 1 })}
                      >
                        <Icon d="M12 5v14M6 13l6 6 6-6" />
                      </button>
                    </form>
                    <form action={removePlaylistItem.bind(null, item.id)}>
                      <button
                        type="submit"
                        className="player-button"
                        aria-label={t("remove", { title: item.track.title, position: i + 1 })}
                      >
                        <Icon d="M6 6l12 12M18 6L6 18" />
                      </button>
                    </form>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {mine ? (
        <section className="settings-form__group" aria-labelledby="playlist-settings">
          <h2 id="playlist-settings" className="section-title">
            {t("settings")}
          </h2>
          <PlaylistEditForm
            id={playlist.id}
            values={{
              title: playlist.title,
              description: playlist.description,
              visibility: playlist.visibility,
            }}
          />
          <div className="playlist-delete">
            <p className="field__hint">{t("deleteHint")}</p>
            <DeletePlaylistButton action={deletePlaylist.bind(null, playlist.id)} />
          </div>
        </section>
      ) : null}
    </article>
  );
}
