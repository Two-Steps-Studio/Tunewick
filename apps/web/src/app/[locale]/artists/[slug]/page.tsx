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
  getRelatedArtists,
  isArtistMember,
} from "@/modules/artists";
import { getOptionalUser } from "@/modules/auth";
import { getPublishedReleases } from "@/modules/catalog";
import { Artwork, getImageSources, getImageSourcesMany } from "@/modules/images";
import { EventList, getArtistEvents } from "@/modules/events";
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
  const tReports = await getTranslations("Reports");
  const tPlaces = await getTranslations("Places");
  const user = await getOptionalUser();
  const [published, photo, follow, related, reach, discovery] = await Promise.all([
    getPublishedReleases(artist.id),
    getImageSources(artist.image_id),
    getArtistFollow(artist.id),
    getRelatedArtists(artist.id),
    getArtistReach(artist.id),
    getArtistDiscovery(artist.id),
  ]);
  const tLinks = await getTranslations("Artists.links");
  const gigs = await getArtistEvents(artist.id);
  const tEvents = await getTranslations("Events");
  const covers = await getImageSourcesMany(
    [...published.map((r) => r.artwork_image_id), ...related.map((a) => a.imageId)],
    320,
  );
  const tRelated = await getTranslations("Artists.related");
  const reason = (r: (typeof related)[number]) => {
    const e = r.evidence;
    switch (r.relation) {
      case "collaborated":
        return tRelated("collaborated", { track: String(e.track ?? "") });
      case "shared_credit":
        return tRelated("sharedCredit", {
          role: String(e.role ?? "other"),
          name: String(e.name ?? ""),
        });
      case "same_label":
        return tRelated("sameLabel", { label: String(e.label ?? "") });
      case "shared_audience":
        return tRelated("sharedAudience", { count: Number(e.followers ?? 0) });
      case "same_city":
        return tRelated("sameCity", { city: String(e.city ?? "") });
      case "played_together":
        return tRelated("playedTogether", { event: String(e.event ?? "") });
    }
  };

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
      {published.length ? (
        <p className="profile__discover">
          <Link
            href={{ pathname: "/", query: { artist: artist.slug } }}
            className="button button--primary"
          >
            {t("profile.discover")}
          </Link>
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
      {discovery.topTracks.length ? (
        <section aria-labelledby="popular" className="discover__section">
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
      {gigs.length ? (
        <section aria-labelledby="gigs" className="discover__section">
          <h2 id="gigs" className="section-title">
            {tEvents("artistUpcoming")}
          </h2>
          <EventList events={gigs} />
        </section>
      ) : null}
      <section aria-labelledby="discography" className="discover__section">
        <h2 id="discography" className="section-title">
          {t("profile.discography")}
        </h2>
        {published.length === 0 ? (
          <p className="field__hint">{t("profile.noReleases")}</p>
        ) : (
          <ul className="release-grid">
            {published.map((r) => (
              <li key={r.id} className="release-card">
                <Link
                  href={{
                    pathname: "/artists/[slug]/releases/[release]",
                    params: { slug: artist.slug, release: r.slug },
                  }}
                  className="release-card__link"
                >
                  <Artwork
                    image={r.artwork_image_id ? (covers.get(r.artwork_image_id) ?? null) : null}
                    alt=""
                    sizes="(min-width: 1024px) 14rem, 45vw"
                  />
                  <span className="release-card__title">{r.title}</span>
                </Link>
                <span className="release-card__artist">
                  {tReleases(`types.${r.type}`)}
                  {(r.release_date ?? r.publish_at)
                    ? ` · ${(r.release_date ?? r.publish_at ?? "").slice(0, 4)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {reach.links.length ? (
        <section aria-labelledby="links" className="discover__section">
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
      {related.length ? (
        <section aria-labelledby="related" className="discover__section">
          <h2 id="related" className="section-title">
            {tRelated("title")}
          </h2>
          <ul className="artist-grid">
            {related.map((a) => (
              <li key={a.id} className="artist-card">
                <Link
                  href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}
                  className="artist-card__link"
                >
                  <Artwork
                    image={a.imageId ? (covers.get(a.imageId) ?? null) : null}
                    alt=""
                    sizes="8rem"
                    className="artwork--round"
                  />
                  <span className="artist-card__name">{a.name}</span>
                </Link>
                <span className="release-card__reason">{reason(a)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="report-link">
        <Link href={{ pathname: "/report", query: { typ: "artist", id: artist.id } }}>
          {tReports("link")}
        </Link>
      </p>
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
