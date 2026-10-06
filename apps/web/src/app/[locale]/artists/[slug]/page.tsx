import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getArtistBySlug, isArtistMember } from "@/modules/artists";
import { getOptionalUser } from "@/modules/auth";
import { getPublishedReleases } from "@/modules/catalog";
import { Artwork, getImageSources } from "@/modules/images";
import { getArtistFollow, LibraryButton } from "@/modules/library";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/artists/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(decodeURIComponent(slug));
  return artist ? { title: artist.name, description: artist.bio ?? undefined } : {};
}

/** Public artist page: only real data — no invented stats, unverified profiles say so. */
export default async function ArtistPage({ params }: PageProps<"/[locale]/artists/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const artist = await getArtistBySlug(decodeURIComponent(slug));
  if (!artist) notFound();

  const t = await getTranslations("Artists");
  const tReleases = await getTranslations("Releases");
  const tPlaces = await getTranslations("Places");
  const user = await getOptionalUser();
  const [published, photo, follow] = await Promise.all([
    getPublishedReleases(artist.id),
    getImageSources(artist.image_id),
    getArtistFollow(artist.id),
  ]);

  return (
    <section className="profile">
      <p className={`artist-badge artist-badge--${artist.verification_status}`}>
        {t(`verification.${artist.verification_status}`)}
      </p>
      {photo ? (
        <Artwork
          image={photo}
          alt={artist.name}
          sizes="8rem"
          className="artwork--round profile__photo"
          priority
        />
      ) : null}
      <h1 className="profile__name">{artist.name}</h1>
      {artist.city || artist.voivodeship ? (
        <p className="profile__place">
          {[
            artist.city,
            artist.voivodeship
              ? tPlaces("voivodeshipShort", { name: tPlaces(`voivodeship.${artist.voivodeship}`) })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <div className="profile__follow">
        <p className="profile__meta">{t("profile.followers", { count: follow.count })}</p>
        {follow.following === null ? null : (
          <LibraryButton
            kind="artist"
            id={artist.id}
            initial={follow.following}
            name={artist.name}
            variant="text"
          />
        )}
      </div>
      {artist.formed_year ? (
        <p className="profile__meta">{t("profile.since", { year: artist.formed_year })}</p>
      ) : null}
      <p className="profile__bio">{artist.bio ?? t("profile.noBio")}</p>
      {published.length === 0 ? (
        <p className="field__hint">{t("profile.noReleases")}</p>
      ) : (
        <ul className="artist-list">
          {published.map((r) => (
            <li key={r.id} className="artist-list__item">
              <Link
                className="artist-list__name"
                href={{
                  pathname: "/artists/[slug]/releases/[release]",
                  params: { slug: artist.slug, release: r.slug },
                }}
              >
                {r.title}
              </Link>
              <span className="field__hint">{tReleases(`types.${r.type}`)}</span>
            </li>
          ))}
        </ul>
      )}
      {user && (await isArtistMember(artist.id)) ? (
        <Link
          href={{ pathname: "/artists/[slug]/manage", params: { slug: artist.slug } }}
          className="button button--quiet"
        >
          {t("profile.manage")}
        </Link>
      ) : null}
    </section>
  );
}
