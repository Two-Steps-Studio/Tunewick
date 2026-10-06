import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getArtistReleases } from "../queries";

/** Releases section of the artist management page (members see drafts). */
export async function ArtistReleaseList({ artist }: { artist: { id: string; slug: string } }) {
  const t = await getTranslations("Releases");
  const releases = await getArtistReleases(artist.id);

  return (
    <section className="settings-form__group" aria-labelledby="releases">
      <h2 id="releases" className="section-title">
        {t("list.title")}
      </h2>
      {releases.length === 0 ? <p className="field__hint">{t("list.empty")}</p> : null}
      <ul className="artist-list">
        {releases.map((r) => (
          <li key={r.id} className="artist-list__item">
            <span className="artist-list__name">{r.title}</span>
            <span className="field__hint">
              {t(`types.${r.type}`)} · {t(`statuses.${r.status}`)}
            </span>
            <Link
              href={{
                pathname: "/artists/[slug]/releases/[release]/edit",
                params: { slug: artist.slug, release: r.slug },
              }}
              className="button button--quiet"
            >
              {t("list.edit")}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={{ pathname: "/artists/[slug]/releases/new", params: { slug: artist.slug } }}
        className="button button--quiet artist-list__create"
      >
        {t("list.create")}
      </Link>
    </section>
  );
}
