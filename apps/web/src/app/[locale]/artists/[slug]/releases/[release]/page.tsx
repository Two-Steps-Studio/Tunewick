import type { Metadata } from "next";
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
import { PlayButton } from "@/modules/player";

type Params = PageProps<"/[locale]/artists/[slug]/releases/[release]">["params"];

async function load(params: Params) {
  const { slug, release } = await params;
  return getPublicRelease(decodeURIComponent(slug), decodeURIComponent(release));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load(params);
  return data ? { title: `${data.release.title} — ${data.artist.name}` } : {};
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
  const data = await load(params);
  if (!data) notFound();

  const { artist, release, tracks } = data;
  const t = await getTranslations("Release");
  const tReleases = await getTranslations("Releases");
  const tReports = await getTranslations("Reports");
  const entitlement = await listenerEntitlement();
  const [playable, cover, likes] = await Promise.all([
    getPlayableTracks(release.id, tracks, artist.name, entitlement),
    getImageSources(release.artwork_image_id, 1280),
    getReleaseLikes(
      release.id,
      tracks.map((track) => track.id),
    ),
  ]);
  const user = likes ? await getOptionalUser() : null;
  const playlists = user ? await getMyPlaylists(user.id) : null;
  const indexOf = (trackId: string) => playable.findIndex((p) => p.id === trackId);
  const total = tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0);
  const year = (release.release_date ?? release.publish_at ?? "").slice(0, 4);

  return (
    <article className="release-page">
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
