import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUser } from "@/modules/auth";
import {
  AddTrackForm,
  DeclarationSummary,
  DeleteReleaseButton,
  GenresForm,
  getLatestDeclaration,
  getReleaseForEditing,
  ReadinessChecklist,
  ReleaseDetailsForm,
  RightsForm,
  TrackItem,
} from "@/modules/catalog";

export const metadata: Metadata = { robots: { index: false } };

/** Release editor for artist members; drafts only (published releases are read-only). */
export default async function ReleaseEditorPage({
  params,
}: PageProps<"/[locale]/artists/[slug]/releases/[release]">) {
  const { locale: rawLocale, slug: rawSlug, release: rawRelease } = await params;
  const locale = rawLocale as Locale;
  const slug = decodeURIComponent(rawSlug);
  const releaseSlug = decodeURIComponent(rawRelease);
  setRequestLocale(locale);

  const here = getPathname({
    href: {
      pathname: "/artists/[slug]/releases/[release]",
      params: { slug, release: releaseSlug },
    },
    locale,
  });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const data = await getReleaseForEditing(slug, releaseSlug);
  if (!data) notFound();

  const t = await getTranslations("Releases");
  const { artist, release, editable, tracks, genreIds, allGenres } = data;
  const declaration = await getLatestDeclaration(release.id);
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
        {!editable ? <p role="status">{t("editor.readOnly")}</p> : null}
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
              />
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
          />
        ) : null}

        {release.status === "draft" ? (
          <DeleteReleaseButton releaseId={release.id} artistSlug={artist.slug} />
        ) : null}
      </div>
    </section>
  );
}
