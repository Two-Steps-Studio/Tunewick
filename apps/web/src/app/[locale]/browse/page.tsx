import { VOIVODESHIPS } from "@tunewick/shared";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji } from "@/lib/intl";
import { getSoundchecks, listenerEntitlement } from "@/modules/audio";
import { getDiscover, parseCountry, parseRegion } from "@/modules/discover";
import { SoundcheckButton } from "@/modules/player";
import { Artwork, getImageSourcesMany } from "@/modules/images";

const NEW_FOR_DAYS = 14;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/browse">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Browse" });
  return { title: t("title") };
}

/**
 * Browse: new music from small independent artists, by country (and voivodeship in Poland).
 * Ordered by release date only — nothing here pretends to be "popular" or "for you"; the
 * Discover feed does that, with reasons. Every item says why it is here.
 */
export default async function BrowsePage({ params, searchParams }: PageProps<"/[locale]/browse">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Browse");
  const tPlaces = await getTranslations("Places");
  const tReleases = await getTranslations("Releases");
  const format = await getFormatter();
  const query = await searchParams;
  const country = parseCountry(query.country) ?? (parseRegion(query.woj) ? "PL" : null);
  const region = country === "PL" ? parseRegion(query.woj) : null;
  const { releases, artists, countries } = await getDiscover(region, country);
  const entitlement = await listenerEntitlement();
  // The artist's soundcheck of each release (M7.4): a few seconds before deciding to listen.
  const soundchecks = await getSoundchecks(
    releases.map((r) => ({ id: r.release_id, artistName: r.artist_name })),
    entitlement,
  );
  const images = await getImageSourcesMany(
    [...releases.map((r) => r.artwork_image_id), ...artists.map((a) => a.image_id)],
    320,
  );
  const now = new Date();

  const place = (city: string | null, voivodeship: string | null, countryCode: string | null) =>
    [
      city,
      voivodeship
        ? tPlaces("voivodeshipShort", { name: tPlaces(`voivodeship.${voivodeship as "slaskie"}`) })
        : null,
      countryCode && countryCode !== country ? countryName(countryCode, locale) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const releaseReason = (publishAt: string, isDebut: boolean) => {
    const date = new Date(publishAt);
    const fresh = now.getTime() - date.getTime() < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
    const when = format.relativeTime(date, now);
    if (isDebut) return t("reason.debut", { when });
    return fresh ? t("reason.new", { when }) : t("reason.released", { when });
  };

  return (
    <section className="discover">
      <header className="discover__head">
        <h1 className="discover__title">{t("title")}</h1>
        <p className="discover__lead">{t("lead")}</p>
        <Link href="/charts" className="discover__more">
          {t("charts")}
        </Link>
      </header>

      <nav aria-label={t("countryLabel")} className="region-filter">
        <Link
          href="/browse"
          className="region-filter__chip"
          aria-current={country === null ? "page" : undefined}
        >
          {t("allCountries")}
        </Link>
        {countries.map((c) => (
          <Link
            key={c.country_code}
            href={{ pathname: "/browse", query: { country: c.country_code } }}
            className="region-filter__chip"
            aria-current={country === c.country_code && region === null ? "page" : undefined}
          >
            <span aria-hidden="true">{flagEmoji(c.country_code)} </span>
            {countryName(c.country_code, locale)}
          </Link>
        ))}
      </nav>

      {country === "PL" ? (
        <nav aria-label={t("regionLabel")} className="region-filter region-filter--sub">
          {VOIVODESHIPS.map((v) => (
            <Link
              key={v}
              href={{ pathname: "/browse", query: { country: "PL", woj: v } }}
              className="region-filter__chip"
              aria-current={region === v ? "page" : undefined}
            >
              {tPlaces(`voivodeship.${v}`)}
            </Link>
          ))}
        </nav>
      ) : null}

      {releases.length === 0 && artists.length === 0 ? (
        <p className="discover__empty" role="status">
          {region
            ? t("emptyRegion", { region: tPlaces(`voivodeship.${region}`) })
            : country
              ? t("emptyCountry", { country: countryName(country, locale) })
              : t("empty")}
        </p>
      ) : null}

      {releases.length ? (
        <section aria-labelledby="new-releases" className="discover__section">
          <h2 id="new-releases" className="section-title">
            {t("newReleases")}
          </h2>
          <ul className="release-grid">
            {releases.map((r) => (
              <li key={r.release_id} className="release-card">
                <Link
                  href={{
                    pathname: "/artists/[slug]/releases/[release]",
                    params: { slug: r.artist_slug, release: r.release_slug },
                  }}
                  className="release-card__link"
                >
                  <Artwork
                    image={r.artwork_image_id ? (images.get(r.artwork_image_id) ?? null) : null}
                    alt=""
                    sizes="(min-width: 1024px) 14rem, 45vw"
                  />
                  <span className="release-card__title">{r.title}</span>
                </Link>
                <span className="release-card__artist">
                  <Link href={{ pathname: "/artists/[slug]", params: { slug: r.artist_slug } }}>
                    {r.artist_name}
                  </Link>
                  {` · ${tReleases(`types.${r.release_type}`)}`}
                </span>
                <span className="release-card__reason">
                  {releaseReason(r.publish_at, r.is_debut)}
                </span>
                {soundchecks.get(r.release_id) ? (
                  <SoundcheckButton
                    {...soundchecks.get(r.release_id)!}
                    entitlement={entitlement}
                    label={t("soundcheckLabel", {
                      title: soundchecks.get(r.release_id)!.track.title,
                      artist: r.artist_name,
                    })}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                    </svg>
                    {t("soundcheck", {
                      seconds: Math.round(soundchecks.get(r.release_id)!.length),
                    })}
                  </SoundcheckButton>
                ) : null}
                {r.city || r.voivodeship || r.country_code ? (
                  <span className="release-card__place">
                    {place(r.city, r.voivodeship, r.country_code)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {artists.length ? (
        <section aria-labelledby="new-artists" className="discover__section">
          <h2 id="new-artists" className="section-title">
            {t("newArtists")}
          </h2>
          <ul className="artist-grid">
            {artists.map((a) => (
              <li key={a.artist_id} className="artist-card">
                <Link
                  href={{ pathname: "/artists/[slug]", params: { slug: a.artist_slug } }}
                  className="artist-card__link"
                >
                  <Artwork
                    image={a.image_id ? (images.get(a.image_id) ?? null) : null}
                    alt=""
                    sizes="8rem"
                    className="artwork--round"
                  />
                  <span className="artist-card__name">{a.name}</span>
                </Link>
                <span className="release-card__reason">
                  {t("reason.firstRelease", {
                    when: format.relativeTime(new Date(a.first_release_at), now),
                    count: a.release_count,
                  })}
                </span>
                {a.city || a.voivodeship || a.country_code ? (
                  <span className="release-card__place">
                    {place(a.city, a.voivodeship, a.country_code)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
