import type { Metadata } from "next";
import { isoDuration, JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/site";
import { alternates } from "@/lib/site";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPlayableTracks, listenerEntitlement } from "@/modules/audio";
import { getPublicRelease } from "@/modules/catalog";
import { Artwork, getImageSources } from "@/modules/images";
import { getOptionalUser } from "@/modules/auth";
import { getReleaseLikes, LibraryButton } from "@/modules/library";
import { AddToPlaylist, getMyPlaylists } from "@/modules/playlists";
import { PlayButton, QueueActions } from "@/modules/player";

type Params = PageProps<"/[locale]/artists/[slug]/releases/[release]">["params"];

async function load(params: Params) {
  const { slug, release } = await params;
  return getPublicRelease(decodeURIComponent(slug), decodeURIComponent(release));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const data = await load(params);
  if (!data) return {};
  const title = `${data.release.title} - ${data.artist.name}`;
  const cover = await getImageSources(data.release.artwork_image_id, 1200);
  return {
    title,
    alternates: alternates(
      {
        pathname: "/artists/[slug]/releases/[release]",
        params: { slug: data.artist.slug, release: data.release.slug },
      },
      locale as Locale,
    ),
    openGraph: {
      type: "music.album",
      title,
      images: cover
        ? [{ url: cover.src, width: cover.width, height: cover.width, alt: title }]
        : undefined,
    },
  };
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** Public release page: only released releases, only real data, playback within the plan. */
export default async function ReleasePage({
  params,
}: PageProps<"/[locale]/artists/[slug]/releases/[release]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  // Independent lookups side by side: each sequential step is a round trip to the database.
  const [data, entitlement, user] = await Promise.all([
    load(params),
    listenerEntitlement(),
    getOptionalUser(),
  ]);
  if (!data) notFound();

  const { artist, release, tracks } = data;
  const t = await getTranslations("Release");
  const tReleases = await getTranslations("Releases");
  const tReports = await getTranslations("Reports");
  const [playable, cover, likes, playlists] = await Promise.all([
    getPlayableTracks(release.id, tracks, artist.name, entitlement),
    getImageSources(release.artwork_image_id, 1280),
    getReleaseLikes(
      release.id,
      tracks.map((track) => track.id),
    ),
    user ? getMyPlaylists(user.id) : null,
  ]);
  const indexOf = (trackId: string) => playable.findIndex((p) => p.id === trackId);
  const total = tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0);
  const year = (release.release_date ?? release.publish_at ?? "").slice(0, 4);

  return (
    <article className="release-page">
      <JsonLd
        data={{
          "@type": "MusicAlbum",
          name: release.title,
          url: absoluteUrl(
            {
              pathname: "/artists/[slug]/releases/[release]",
              params: { slug: artist.slug, release: release.slug },
            },
            locale as Locale,
          ),
          image: cover?.src,
          datePublished: release.release_date ?? undefined,
          numTracks: tracks.length,
          byArtist: {
            "@type": "MusicGroup",
            name: artist.name,
            url: absoluteUrl(
              { pathname: "/artists/[slug]", params: { slug: artist.slug } },
              locale as Locale,
            ),
          },
          track: tracks.map((track) => ({
            "@type": "MusicRecording",
            name: track.title,
            duration: isoDuration(track.duration_ms),
          })),
        }}
      />
      <header className="release-page__head">
        <Artwork
          image={cover}
          alt={t("coverAlt", { title: release.title, artist: artist.name })}
          sizes="(min-width: 768px) 20rem, 100vw"
          className="release-page__cover"
          priority
        />
        <div className="release-page__info">
          <p className="artist-badge">
            {tReleases(`types.${release.type}`)}
            {year ? ` · ${year}` : ""}
          </p>
          <h1 className="release-page__title">{release.title}</h1>
          <p className="release-page__artist">
            <Link href={{ pathname: "/artists/[slug]", params: { slug: artist.slug } }}>
              {artist.name}
            </Link>
          </p>
          <p className="release-page__meta">
            {t("trackCount", { count: tracks.length })}
            {total ? ` · ${formatDuration(total)}` : ""}
            {release.explicit ? ` · ${t("explicit")}` : ""}
          </p>
          <p className="release-page__ai">{t(`ai.${release.ai_content}`)}</p>
          {playable.length ? (
            <PlayButton
              tracks={playable}
              index={0}
              entitlement={entitlement}
              label={t("playAll", { title: release.title })}
              className="button button--primary"
            >
              {t("play")}
            </PlayButton>
          ) : (
            <p className="field__hint">{t("notPlayable")}</p>
          )}
          {likes ? (
            <LibraryButton
              kind="release"
              id={release.id}
              initial={likes.release}
              name={release.title}
              variant="text"
            />
          ) : null}
        </div>
      </header>

      <ol className="release-tracks">
        {tracks.map((track) => {
          const index = indexOf(track.id);
          return (
            <li
              key={track.id}
              className={
                likes ? "release-tracks__item release-tracks__item--likes" : "release-tracks__item"
              }
            >
              <span className="release-tracks__number">{track.track_number}</span>
              <span className="release-tracks__title">
                {track.title}
                {track.explicit ? (
                  <abbr className="release-tracks__explicit" title={t("explicit")}>
                    E
                  </abbr>
                ) : null}
              </span>
              <span className="release-tracks__duration">
                {track.duration_ms ? formatDuration(track.duration_ms) : ""}
              </span>
              {index !== -1 ? (
                <PlayButton
                  tracks={playable}
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
              {likes ? (
                <LibraryButton
                  kind="track"
                  id={track.id}
                  initial={likes.tracks.has(track.id)}
                  name={track.title}
                />
              ) : null}
              {playlists ? (
                <AddToPlaylist
                  trackId={track.id}
                  trackTitle={track.title}
                  playlists={playlists.map((p) => ({ id: p.id, title: p.title }))}
                  extra={index >= 0 ? <QueueActions track={playable[index]!} /> : null}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {tracks.some((track) => track.credits.length) ? (
        <section aria-labelledby="credits" className="release-credits">
          <h2 id="credits" className="section-title">
            {t("credits")}
          </h2>
          <dl className="release-credits__list">
            {tracks
              .filter((track) => track.credits.length)
              .map((track) => (
                <div key={track.id} className="release-credits__track">
                  <dt>{track.title}</dt>
                  <dd>
                    <ul>
                      {track.credits.map((c) => (
                        <li key={c.id}>
                          <span className="release-credits__role">
                            {tReleases(`creditRoles.${c.role}`)}
                          </span>{" "}
                          {c.artist ? (
                            <Link
                              href={{
                                pathname: "/artists/[slug]",
                                params: { slug: c.artist.slug },
                              }}
                            >
                              {c.name}
                            </Link>
                          ) : (
                            c.name
                          )}
                          {c.detail ? ` (${c.detail})` : ""}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}

      {entitlement !== "hires" ? <p className="field__hint">{t("qualityNote")}</p> : null}
      {release.p_line || release.c_line ? (
        <p className="release-page__lines">
          {[release.p_line && `℗ ${release.p_line}`, release.c_line && `© ${release.c_line}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <p className="report-link">
        <Link href={{ pathname: "/report", query: { typ: "release", id: release.id } }}>
          {tReports("link")}
        </Link>
      </p>
    </article>
  );
}
