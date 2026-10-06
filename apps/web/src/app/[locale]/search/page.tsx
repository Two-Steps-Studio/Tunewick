import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPlayableTracks, listenerEntitlement } from "@/modules/audio";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import { PlayButton, type PlayerTrack } from "@/modules/player";
import {
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  searchCatalog,
  type SearchHit,
} from "@/modules/search";

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  const q = String((await searchParams).q ?? "").trim();
  const t = await getTranslations({ locale: locale as Locale, namespace: "Search" });
  return { title: q ? t("titleFor", { query: q }) : t("title"), robots: { index: !q } };
}

/** Tracks among the hits that can be played, in hit order (one playback lookup per release). */
async function playableHits(tracks: SearchHit[]): Promise<PlayerTrack[]> {
  const entitlement = await listenerEntitlement();
  const releases = [...new Set(tracks.map((t) => t.release_id).filter(Boolean))] as string[];
  const byRelease = await Promise.all(
    releases.map((releaseId) => {
      const first = tracks.find((t) => t.release_id === releaseId)!;
      return getPlayableTracks(
        releaseId,
        tracks.filter((t) => t.release_id === releaseId).map((t) => ({ id: t.id, title: t.title })),
        first.artist_name,
        entitlement,
      );
    }),
  );
  const playable = byRelease.flat();
  return tracks.flatMap((hit) => playable.filter((p) => p.id === hit.id));
}

/** Search across the public catalog. The query lives in the URL, so results can be shared. */
export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Search");
  const tReleases = await getTranslations("Releases");
  const q = String((await searchParams).q ?? "").slice(0, MAX_QUERY_LENGTH);
  const results = await searchCatalog(q);
  const hasQuery = results.query.length >= MIN_QUERY_LENGTH;
  const total = results.artists.length + results.releases.length + results.tracks.length;
  const [images, playable, entitlement] = await Promise.all([
    getImageSourcesMany(
      [...results.artists, ...results.releases, ...results.tracks].map((h) => h.image_id),
    ),
    playableHits(results.tracks),
    listenerEntitlement(),
  ]);

  const thumb = (hit: SearchHit, round = false) => (
    <Artwork
      image={hit.image_id ? (images.get(hit.image_id) ?? null) : null}
      alt=""
      sizes="3rem"
      className={`search-hit__thumb${round ? " artwork--round" : ""}`}
    />
  );

  return (
    <section className="search-page">
      <h1 className="search-page__title">{t("title")}</h1>
      <form role="search" className="search-form" action="">
        <label htmlFor="search-q" className="visually-hidden">
          {t("label")}
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          className="field__input search-form__input"
          defaultValue={q}
          placeholder={t("placeholder")}
          maxLength={MAX_QUERY_LENGTH}
          enterKeyHint="search"
          autoComplete="off"
        />
        <button type="submit" className="button button--primary">
          {t("submit")}
        </button>
      </form>

      {!q ? <p className="search-page__lead">{t("lead")}</p> : null}
      {q && !hasQuery ? <p className="field__hint">{t("tooShort")}</p> : null}
      {hasQuery && total === 0 ? (
        <p role="status" className="search-page__empty">
          {t("noResults", { query: results.query })}
        </p>
      ) : null}

      {results.artists.length ? (
        <section aria-labelledby="search-artists" className="search-group">
          <h2 id="search-artists" className="section-title">
            {t("artists")}
          </h2>
          <ul className="search-hits">
            {results.artists.map((hit) => (
              <li key={hit.id} className="search-hit">
                {thumb(hit, true)}
                <Link
                  className="search-hit__title"
                  href={{ pathname: "/artists/[slug]", params: { slug: hit.artist_slug } }}
                >
                  {hit.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.releases.length ? (
        <section aria-labelledby="search-releases" className="search-group">
          <h2 id="search-releases" className="section-title">
            {t("releases")}
          </h2>
          <ul className="search-hits">
            {results.releases.map((hit) => (
              <li key={hit.id} className="search-hit">
                {thumb(hit)}
                <span className="search-hit__text">
                  <Link
                    className="search-hit__title"
                    href={{
                      pathname: "/artists/[slug]/releases/[release]",
                      params: { slug: hit.artist_slug, release: hit.release_slug! },
                    }}
                  >
                    {hit.title}
                  </Link>
                  <span className="search-hit__meta">
                    {hit.artist_name} · {tReleases(`types.${hit.release_type!}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.tracks.length ? (
        <section aria-labelledby="search-tracks" className="search-group">
          <h2 id="search-tracks" className="section-title">
            {t("tracks")}
          </h2>
          <ul className="search-hits">
            {results.tracks.map((hit) => {
              const index = playable.findIndex((p) => p.id === hit.id);
              return (
                <li key={hit.id} className="search-hit">
                  {thumb(hit)}
                  <span className="search-hit__text">
                    <span className="search-hit__title">{hit.title}</span>
                    <span className="search-hit__meta">
                      {hit.artist_name} ·{" "}
                      <Link
                        href={{
                          pathname: "/artists/[slug]/releases/[release]",
                          params: { slug: hit.artist_slug, release: hit.release_slug! },
                        }}
                      >
                        {hit.release_title}
                      </Link>
                    </span>
                  </span>
                  {index !== -1 ? (
                    <PlayButton
                      tracks={playable}
                      index={index}
                      entitlement={entitlement}
                      label={t("play", { title: hit.title })}
                      className="player-button search-hit__play"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                      </svg>
                    </PlayButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
