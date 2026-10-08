import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  audioReadiness,
  getLatestTrackAudio,
  getPlayableTracks,
  isAudioUploadAvailable,
  TrackAudioUpload,
} from "@/modules/audio";
import { requireUser } from "@/modules/auth";
import { Artwork, getImageSources, getLatestImageUpload, ImageUpload } from "@/modules/images";
import {
  AddTrackForm,
  DeclarationSummary,
  DeleteReleaseButton,
  GenresForm,
  getLatestDeclaration,
  getReleaseForEditing,
  ReadinessChecklist,
  ReleaseDetailsForm,
  ReviewStatus,
  RightsForm,
  SubmitReleaseForm,
  TrackItem,
} from "@/modules/catalog";

export const metadata: Metadata = { robots: { index: false } };

/** Release editor for artist members; drafts only (published releases are read-only). */
export default async function ReleaseEditorPage({
  params,
}: PageProps<"/[locale]/artists/[slug]/releases/[release]/edit">) {
  const { locale: rawLocale, slug: rawSlug, release: rawRelease } = await params;
  const locale = rawLocale as Locale;
  const slug = decodeURIComponent(rawSlug);
  const releaseSlug = decodeURIComponent(rawRelease);
  setRequestLocale(locale);

  const here = getPathname({
    href: {
      pathname: "/artists/[slug]/releases/[release]/edit",
      params: { slug, release: releaseSlug },
    },
    locale,
  });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const data = await getReleaseForEditing(slug, releaseSlug);
  if (!data) notFound();

  const t = await getTranslations("Releases");
  const { artist, release, editable, tracks, genreIds, allGenres } = data;
  const trackIds = tracks.map((track) => track.id);
  const [declaration, audio, cover, coverUpload] = await Promise.all([
    getLatestDeclaration(release.id),
    getLatestTrackAudio(trackIds),
    getImageSources(release.artwork_image_id),
    getLatestImageUpload("release_artwork", release.id),
  ]);
  const uploadAvailable = isAudioUploadAvailable();
  // Members hear every version of their own tracks.
  const previewTracks = await getPlayableTracks(release.id, tracks, artist.name, "hires");
  const audioState = audioReadiness(trackIds, audio);
  const readyToSubmit =
    tracks.length > 0 &&
    release.ai_content !== "unknown" &&
    Boolean(declaration) &&
    Boolean(cover) &&
    audioState === "ready";
  const previewFor = (trackId: string) => {
    const index = previewTracks.findIndex((p) => p.id === trackId);
    return index === -1 ? undefined : { tracks: previewTracks, index };
  };
  const territory = (["WORLD", "EU", "PL"] as const).find((v) => release.territories.includes(v));
  const territoryLabel = territory ? t(`territories.${territory}`) : release.territories.join(", ");

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <p className="artist-badge">
          {t(`types.${release.type}`)} · {t(`statuses.${release.status}`)}
        </p>
        <h1 className="auth-page__title">{release.title}</h1>
        <p className="auth-page__lead">{artist.name}</p>
        {editable && release.ai_content === "unknown" ? (
          <p className="form-error">{t("editor.aiMissing")}</p>
        ) : null}
        <ReviewStatus release={release} artistSlug={artist.slug} />
        {!editable && release.status !== "in_review" && release.status !== "published" ? (
          <p role="status">{t("editor.readOnly")}</p>
        ) : null}
        <p className="settings-profile-link">
          <Link href={{ pathname: "/artists/[slug]/manage", params: { slug: artist.slug } }}>
            {t("editor.back")}
          </Link>
        </p>
      </div>

      <div className="auth-page__body">
        {editable ? (
          <section className="settings-form__group" aria-labelledby="details">
            <h2 id="details" className="section-title">
              {t("editor.details")}
            </h2>
            <ReleaseDetailsForm release={release} artistSlug={artist.slug} />
          </section>
        ) : null}

        <section className="settings-form__group" aria-labelledby="cover">
          <h2 id="cover" className="section-title">
            {t("editor.cover")}
          </h2>
          <div className="cover-editor">
            <Artwork
              image={cover}
              alt={t("editor.coverAlt", { title: release.title })}
              sizes="10rem"
            />
            {editable ? (
              <ImageUpload
                kind="release_artwork"
                ownerId={release.id}
                hasImage={Boolean(cover)}
                latest={coverUpload}
              />
            ) : null}
          </div>
        </section>

        <section className="settings-form__group" aria-labelledby="tracks">
          <h2 id="tracks" className="section-title">
            {t("editor.tracks")}
          </h2>
          {tracks.length === 0 ? <p className="field__hint">{t("editor.noTracks")}</p> : null}
          <ol className="track-list">
            {tracks.map((track, i) => (
              <TrackItem
                key={track.id}
                track={track}
                editable={editable}
                isFirst={i === 0}
                isLast={i === tracks.length - 1}
              >
                {editable ? (
                  <TrackAudioUpload
                    trackId={track.id}
                    trackTitle={track.title}
                    audio={audio.get(track.id) ?? null}
                    available={uploadAvailable}
                    preview={previewFor(track.id)}
                  />
                ) : null}
              </TrackItem>
            ))}
          </ol>
          {editable ? <AddTrackForm releaseId={release.id} /> : null}
        </section>

        {editable ? (
          <section className="settings-form__group" aria-labelledby="genres">
            <h2 id="genres" className="section-title">
              {t("editor.genres")}
            </h2>
            <GenresForm releaseId={release.id} selected={genreIds} genres={allGenres} />
          </section>
        ) : null}

        <section className="settings-form__group" aria-labelledby="rights">
          <h2 id="rights" className="section-title">
            {t("rights.title")}
          </h2>
          {declaration ? <DeclarationSummary declaration={declaration} /> : null}
          {editable && !declaration ? (
            <RightsForm
              releaseId={release.id}
              defaultAi={release.ai_content}
              territoryLabel={territoryLabel}
            />
          ) : null}
          {editable && declaration ? (
            <details className="track-item__details">
              <summary>{t("rights.newDeclaration")}</summary>
              <RightsForm
                releaseId={release.id}
                defaultAi={release.ai_content}
                territoryLabel={territoryLabel}
              />
            </details>
          ) : null}
        </section>

        {editable ? (
          <ReadinessChecklist
            hasTracks={tracks.length > 0}
            aiDeclared={release.ai_content !== "unknown"}
            rightsDeclared={Boolean(declaration)}
            artwork={Boolean(cover)}
            audio={audioState}
          />
        ) : null}
        {editable && readyToSubmit ? <SubmitReleaseForm releaseId={release.id} /> : null}

        {release.status === "draft" ? (
          <DeleteReleaseButton releaseId={release.id} artistSlug={artist.slug} />
        ) : null}
      </div>
    </section>
  );
}
