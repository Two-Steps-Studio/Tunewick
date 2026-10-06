import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPlayableTracks, listenerEntitlement } from "@/modules/audio";
import { getPublicRelease } from "@/modules/catalog";
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
  const entitlement = await listenerEntitlement();
  const playable = await getPlayableTracks(release.id, tracks, artist.name, entitlement);
  const indexOf = (trackId: string) => playable.findIndex((p) => p.id === trackId);
  const total = tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0);
  const year = (release.release_date ?? release.publish_at ?? "").slice(0, 4);

  return (
    <article className="release-page">
      <header className="release-page__head">
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
      </header>

      <ol className="release-tracks">
        {tracks.map((track) => {
          const index = indexOf(track.id);
          return (
            <li key={track.id} className="release-tracks__item">
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
            </li>
          );
        })}
      </ol>

      {entitlement !== "hires" ? <p className="field__hint">{t("qualityNote")}</p> : null}
      {release.p_line || release.c_line ? (
        <p className="release-page__lines">
          {[release.p_line && `℗ ${release.p_line}`, release.c_line && `© ${release.c_line}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </article>
  );
}
