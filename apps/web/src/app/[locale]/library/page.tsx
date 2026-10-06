import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPlayableQueue, listenerEntitlement } from "@/modules/audio";
import { getOptionalUser } from "@/modules/auth";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import {
  ClearHistoryButton,
  getLibrary,
  getRecentlyPlayed,
  LibraryButton,
} from "@/modules/library";
import { EventList, getMyAttendedEvents } from "@/modules/events";
import { getMyPlaylists, NewPlaylistForm } from "@/modules/playlists";
import { PlayButton, type PlayerTrack } from "@/modules/player";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/library">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Library" });
  return { title: t("title"), robots: { index: false } };
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The listener's own music: liked tracks (playable in the order they were liked), releases, artists. */
export default async function LibraryPage({ params }: PageProps<"/[locale]/library">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("Library");
  const user = await getOptionalUser();

  if (!user) {
    return (
      <section className="discover">
        <header className="discover__head">
          <h1 className="discover__title">{t("title")}</h1>
          <p className="discover__lead">{t("signedOut")}</p>
        </header>
        <p>
          <Link
            className="button button--primary"
            href={{
              pathname: "/login",
              query: { next: getPathname({ href: "/library", locale }) },
            }}
          >
            {t("signIn")}
          </Link>
        </p>
      </section>
    );
  }

  const tReleases = await getTranslations("Releases");
  const tPlaylists = await getTranslations("Playlists");
  const format = await getFormatter();
  const [library, entitlement, playlists, recent] = await Promise.all([
    getLibrary(),
    listenerEntitlement(),
    getMyPlaylists(user.id),
    getRecentlyPlayed(),
  ]);
  const gigs = await getMyAttendedEvents();

  // Liked tracks play as one queue, in the order they were liked.
  const queue = (
    await getPlayableQueue(
      library.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        releaseId: track.release.id,
        artistName: track.release.artist.name,
      })),
      entitlement,
    )
  ).filter((track): track is PlayerTrack => track !== null);
  const images = await getImageSourcesMany(
    [...library.releases.map((r) => r.artwork_image_id), ...library.artists.map((a) => a.image_id)],
    320,
  );
  const empty =
    !library.tracks.length &&
    !library.releases.length &&
    !library.artists.length &&
    !playlists.length &&
    !recent.length &&
    !gigs.length;

  return (
    <section className="discover">
      <header className="discover__head">
        <h1 className="discover__title">{t("title")}</h1>
        <p className="discover__lead">{empty ? t("empty") : t("lead")}</p>
      </header>

      <section aria-labelledby="playlists" className="discover__section">
        <h2 id="playlists" className="section-title">
          {t("playlists")}
        </h2>
        {playlists.length ? (
          <ul className="artist-list">
            {playlists.map((p) => (
              <li key={p.id} className="artist-list__item">
                <Link
                  className="artist-list__name"
                  href={{ pathname: "/playlists/[id]", params: { id: p.id } }}
                >
                  {p.title}
                </Link>
                <span className="field__hint">
                  {tPlaylists("trackCount", { count: p.count })} ·{" "}
                  {tPlaylists(`visibility.${p.visibility}`)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <NewPlaylistForm />
      </section>

      {library.tracks.length ? (
        <section aria-labelledby="liked-tracks" className="discover__section">
          <h2 id="liked-tracks" className="section-title">
            {t("likedTracks", { count: library.tracks.length })}
          </h2>
          {queue.length ? (
            <p>
              <PlayButton
                tracks={queue}
                index={0}
                entitlement={entitlement}
                label={t("playLiked")}
                className="button button--primary"
              >
                {t("play")}
              </PlayButton>
            </p>
          ) : null}
          <ol className="release-tracks">
            {library.tracks.map((track) => {
              const index = queue.findIndex((p) => p.id === track.id);
              return (
                <li key={track.id} className="release-tracks__item release-tracks__item--likes">
                  <span className="release-tracks__number">{index === -1 ? "" : index + 1}</span>
                  <span className="release-tracks__title">
                    {track.title}
                    <span className="library-track__by">
                      <Link
                        href={{
                          pathname: "/artists/[slug]",
                          params: { slug: track.release.artist.slug },
                        }}
                      >
                        {track.release.artist.name}
                      </Link>
                      {" · "}
                      <Link
                        href={{
                          pathname: "/artists/[slug]/releases/[release]",
                          params: { slug: track.release.artist.slug, release: track.release.slug },
                        }}
                      >
                        {track.release.title}
                      </Link>
                    </span>
                  </span>
                  <span className="release-tracks__duration">
                    {track.duration_ms ? formatDuration(track.duration_ms) : ""}
                  </span>
                  {index !== -1 ? (
                    <PlayButton
                      tracks={queue}
                      index={index}
                      entitlement={entitlement}
                      label={t("playTrack", { title: track.title })}
                      className="player-button release-tracks__play"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                      </svg>
                    </PlayButton>
                  ) : (
                    <span />
                  )}
                  <LibraryButton kind="track" id={track.id} initial name={track.title} />
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {recent.length ? (
        <section aria-labelledby="recent" className="discover__section">
          <h2 id="recent" className="section-title">
            {t("history.title")}
          </h2>
          <p className="field__hint">{t("history.lead")}</p>
          <ol className="release-tracks">
            {recent.map((track) => (
              <li key={track.id} className="release-tracks__item recent-item">
                <span className="release-tracks__number" />
                <span className="release-tracks__title">
                  <Link
                    href={{
                      pathname: "/artists/[slug]/releases/[release]",
                      params: { slug: track.release.artist.slug, release: track.release.slug },
                    }}
                  >
                    {track.title}
                  </Link>
                  <span className="library-track__by">{track.release.artist.name}</span>
                </span>
                <span className="release-tracks__duration">
                  {t("history.when", {
                    when: format.relativeTime(new Date(track.lastPlayedAt), new Date()),
                    count: track.plays,
                  })}
                </span>
              </li>
            ))}
          </ol>
          <ClearHistoryButton />
        </section>
      ) : null}

      {gigs.length ? (
        <section aria-labelledby="gigs" className="discover__section">
          <h2 id="gigs" className="section-title">
            {t("gigs")}
          </h2>
          <p className="field__hint">{t("gigsLead")}</p>
          <EventList events={gigs} />
        </section>
      ) : null}

      {library.releases.length ? (
        <section aria-labelledby="liked-releases" className="discover__section">
          <h2 id="liked-releases" className="section-title">
            {t("likedReleases")}
          </h2>
          <ul className="release-grid">
            {library.releases.map((r) => (
              <li key={r.id} className="release-card">
                <Link
                  href={{
                    pathname: "/artists/[slug]/releases/[release]",
                    params: { slug: r.artist.slug, release: r.slug },
                  }}
                  className="release-card__link"
                >
                  <Artwork
                    image={r.artwork_image_id ? (images.get(r.artwork_image_id) ?? null) : null}
                    alt=""
                    sizes="(min-width: 1024px) 14rem, 45vw"
                  />
                  <span className="release-card__title">{r.title}</span>
                </Link>
                <span className="release-card__artist">
                  {r.artist.name} · {tReleases(`types.${r.type}`)}
                </span>
                {r.publish_at ? (
                  <span className="release-card__place">
                    {format.dateTime(new Date(r.publish_at), { year: "numeric" })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {library.artists.length ? (
        <section aria-labelledby="followed-artists" className="discover__section">
          <h2 id="followed-artists" className="section-title">
            {t("followedArtists")}
          </h2>
          <ul className="artist-grid">
            {library.artists.map((a) => (
              <li key={a.id} className="artist-card">
                <Link
                  href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}
                  className="artist-card__link"
                >
                  <Artwork
                    image={a.image_id ? (images.get(a.image_id) ?? null) : null}
                    alt=""
                    sizes="8rem"
                    className="artwork--round"
                  />
                  <span className="artist-card__name">{a.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
