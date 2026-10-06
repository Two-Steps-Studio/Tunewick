import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AudioReport, getLatestTrackAudio, getPlayableTracks } from "@/modules/audio";
import { requireStaff } from "@/modules/auth";
import { DeclarationSummary, getLatestDeclaration } from "@/modules/catalog";
import { Artwork, getImageSources } from "@/modules/images";
import { DecisionForm, getSubmission } from "@/modules/moderation";
import { PlayButton } from "@/modules/player";

export const metadata: Metadata = { robots: { index: false } };

/** One submission: metadata, rights, every track's audio report and playback, then a decision. */
export default async function SubmissionPage({
  params,
}: PageProps<"/[locale]/moderation/[release]">) {
  const { locale: rawLocale, release: releaseId } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  await requireStaff("moderator", {
    signIn: getPathname({ href: { pathname: "/login", query: { next: "/moderation" } }, locale }),
    security: getPathname({ href: "/settings/security", locale }),
    forbidden: getPathname({ href: "/", locale }),
  });

  const data = await getSubmission(releaseId);
  if (!data) notFound();
  const { release, artist, tracks, history } = data;
  const t = await getTranslations("Moderation");
  const tReleases = await getTranslations("Releases");
  const tArtists = await getTranslations("Artists");
  const format = await getFormatter();
  const [declaration, audio, playable, cover] = await Promise.all([
    getLatestDeclaration(release.id),
    getLatestTrackAudio(tracks.map((track) => track.id)),
    getPlayableTracks(release.id, tracks, artist.name, "hires"),
    getImageSources(release.artwork_image_id, 1280),
  ]);

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <p className="artist-badge">
          {tReleases(`types.${release.type}`)} · {tReleases(`statuses.${release.status}`)}
        </p>
        <h1 className="auth-page__title">{release.title}</h1>
        <p className="auth-page__lead">
          <Link href={{ pathname: "/artists/[slug]", params: { slug: artist.slug } }}>
            {artist.name}
          </Link>
          {` · ${tArtists(`verification.${artist.verification_status}`)}`}
        </p>
        <p className="settings-profile-link">
          <Link href="/moderation">{t("back")}</Link>
        </p>
      </div>

      <div className="auth-page__body">
        <section className="settings-form__group" aria-labelledby="meta">
          <h2 id="meta" className="section-title">
            {t("metadata")}
          </h2>
          <Artwork image={cover} alt={t("cover")} sizes="16rem" className="moderation-cover" />
          <dl className="moderation-meta">
            <dt>{t("fields.releaseDate")}</dt>
            <dd>{release.release_date ?? t("none")}</dd>
            <dt>{t("fields.ai")}</dt>
            <dd>{tReleases(`ai.${release.ai_content}`)}</dd>
            <dt>{t("fields.explicit")}</dt>
            <dd>{release.explicit ? t("yes") : t("no")}</dd>
            <dt>{t("fields.territories")}</dt>
            <dd>{release.territories.join(", ")}</dd>
            <dt>{t("fields.lines")}</dt>
            <dd>{[release.p_line, release.c_line].filter(Boolean).join(" · ") || t("none")}</dd>
          </dl>
        </section>

        <section className="settings-form__group" aria-labelledby="rights">
          <h2 id="rights" className="section-title">
            {tReleases("rights.title")}
          </h2>
          {declaration ? <DeclarationSummary declaration={declaration} /> : <p>{t("none")}</p>}
        </section>

        <section className="settings-form__group" aria-labelledby="tracks">
          <h2 id="tracks" className="section-title">
            {tReleases("editor.tracks")}
          </h2>
          <ol className="track-list">
            {tracks.map((track) => {
              const report = audio.get(track.id);
              const index = playable.findIndex((p) => p.id === track.id);
              const details = [
                track.isrc ? `ISRC ${track.isrc}` : null,
                tReleases(`ai.${track.ai_content}`),
                track.explicit ? t("fields.explicit") : null,
                ...track.credits.map((c) => `${c.name} (${tReleases(`creditRoles.${c.role}`)})`),
              ].filter(Boolean);
              return (
                <li key={track.id} className="track-item">
                  <div className="track-item__head">
                    <span className="track-item__number">{track.track_number}</span>
                    <span className="track-item__title">{track.title}</span>
                    {index !== -1 ? (
                      <PlayButton
                        tracks={playable}
                        index={index}
                        entitlement="hires"
                        label={t("listen", { title: track.title })}
                      >
                        {t("listenShort")}
                      </PlayButton>
                    ) : null}
                  </div>
                  <div className="track-audio">
                    {report?.status === "accepted" ? (
                      <AudioReport audio={report} />
                    ) : (
                      <p className="form-error">{t("noAudio")}</p>
                    )}
                    <p className="field__hint">{details.join(" · ")}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {history.length ? (
          <section className="settings-form__group" aria-labelledby="history">
            <h2 id="history" className="section-title">
              {t("history")}
            </h2>
            <ul className="moderation-history">
              {history.map((event, i) => (
                <li key={i}>
                  {format.dateTime(new Date(event.created_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {` — ${t(`events.${event.kind}`)}`}
                  {event.note ? `: ${event.note}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {release.status === "in_review" ? (
          <section className="settings-form__group" aria-labelledby="decision">
            <h2 id="decision" className="section-title">
              {t("decision.title")}
            </h2>
            <DecisionForm releaseId={release.id} />
          </section>
        ) : (
          <p role="status">{t("decided")}</p>
        )}
      </div>
    </section>
  );
}
