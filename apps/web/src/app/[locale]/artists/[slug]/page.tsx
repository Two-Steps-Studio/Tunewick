import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji, languageName, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import {
  getArtistBySlug,
  getArtistDiscovery,
  getArtistReach,
  isArtistMember,
} from "@/modules/artists";
import { getOptionalUser } from "@/modules/auth";
import { getPublishedReleases } from "@/modules/catalog";
import { ReportButton } from "@/modules/discover";
import { Artwork, getImageSources, getImageSourcesMany } from "@/modules/images";
import { getArtistFollow, LibraryButton } from "@/modules/library";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/artists/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(decodeURIComponent(slug));
  return artist ? { title: artist.name, description: artist.bio ?? undefined } : {};
}

/**
 * Public artist page: only real data — no invented stats, unverified profiles say so. Where they
 * are from, what they make, popular and newest music, and artists like them to discover next.
 */
export default async function ArtistPage({ params }: PageProps<"/[locale]/artists/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const artist = await getArtistBySlug(decodeURIComponent(slug));
  if (!artist) notFound();

  const t = await getTranslations("Artists");
  const tReleases = await getTranslations("Releases");
  const tPlaces = await getTranslations("Places");
  const user = await getOptionalUser();
  const [published, photo, follow, reach, discovery] = await Promise.all([
    getPublishedReleases(artist.id),
    getImageSources(artist.image_id),
    getArtistFollow(artist.id),
    getArtistReach(artist.id),
    getArtistDiscovery(artist.id),
  ]);
  const similarImages = await getImageSourcesMany(
    discovery.similar.map((a) => a.image_id),
    160,
  );
  const tLinks = await getTranslations("Artists.links");

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
      {artist.city || artist.voivodeship || artist.region || artist.country_code ? (
        <p className="profile__place">
          {artist.country_code ? (
            <span aria-hidden="true">{flagEmoji(artist.country_code)} </span>
          ) : null}
          {[
            artist.city,
            artist.voivodeship
              ? tPlaces("voivodeshipShort", { name: tPlaces(`voivodeship.${artist.voivodeship}`) })
              : artist.region,
            artist.country_code ? countryName(artist.country_code, locale) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {reach.genres.length || artist.languages.length ? (
        <p className="profile__tags">
          {reach.genres.map((g) => (
            <span key={g.id} className="feed-card__genre">
              {locale === "pl" ? g.name_pl : g.name_en}
            </span>
          ))}
          {artist.languages.length ? (
            <span className="profile__languages">
              {t("profile.languages", {
                languages: artist.languages.map((l) => languageName(l, locale)).join(", "),
              })}
            </span>
          ) : null}
        </p>
      ) : null}
      <p className="profile__discover">
        <Link
          href={{ pathname: "/", query: { artist: artist.slug } }}
          className="button button--primary"
        >
          {t("profile.discover")}
        </Link>
      </p>
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
      {discovery.topTracks.length ? (
        <section aria-labelledby="popular" className="profile__section">
          <h2 id="popular" className="section-title">
            {t("profile.popular")}
          </h2>
          <ol className="artist-list">
            {discovery.topTracks.map((track) => (
              <li key={track.track_id} className="artist-list__item">
                <Link
                  className="artist-list__name"
                  href={{
                    pathname: "/song/[artist]/[song]",
                    params: {
                      artist: artist.slug,
                      song: songSegment(track.title, track.public_code, slugify),
                    },
                  }}
                >
                  {track.title}
                </Link>
                <span className="field__hint">
                  {track.listeners_30d
                    ? t("profile.listeners", { count: track.listeners_30d })
                    : track.release_title}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section aria-labelledby="releases" className="profile__section">
        <h2 id="releases" className="section-title">
          {t("profile.newest")}
        </h2>
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
      </section>
      {reach.links.length ? (
        <section aria-labelledby="links" className="profile__section">
          <h2 id="links" className="section-title">
            {t("profile.links")}
          </h2>
          <ul className="profile__links">
            {reach.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} rel="noopener nofollow ugc" target="_blank">
                  {tLinks(link.kind as "website")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {discovery.similar.length ? (
        <section aria-labelledby="similar" className="profile__section">
          <h2 id="similar" className="section-title">
            {t("profile.similar")}
          </h2>
          <ul className="artist-grid">
            {discovery.similar.map((a) => (
              <li key={a.artist_id} className="artist-card">
                <Link
                  href={{ pathname: "/artists/[slug]", params: { slug: a.artist_slug } }}
                  className="artist-card__link"
                >
                  <Artwork
                    image={a.image_id ? (similarImages.get(a.image_id) ?? null) : null}
                    alt=""
                    sizes="8rem"
                    className="artwork--round"
                  />
                  <span className="artist-card__name">{a.name}</span>
                </Link>
                <span className="release-card__reason">
                  {a.shared_listeners
                    ? t("profile.similarListeners", { count: a.shared_listeners })
                    : a.same_country && a.country_code
                      ? t("profile.similarCountry", {
                          country: countryName(a.country_code, locale),
                        })
                      : t("profile.similarGenres")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {user ? (
        <div className="profile__report">
          <ReportButton
            subjectType="artist"
            subjectId={artist.id}
            name={artist.name}
            className="button button--quiet"
          />
        </div>
      ) : null}
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
