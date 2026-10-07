import { VOIVODESHIPS } from "@tunewick/shared";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSoundchecks, listenerEntitlement } from "@/modules/audio";
import { getDiscover, parseRegion } from "@/modules/discover";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import { SoundcheckButton } from "@/modules/player";

const NEW_FOR_DAYS = 14;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Discover" });
  return { title: t("title") };
}

/**
 * Discover: new music from small independent artists across Poland. Ordered by release date
 * only — there is no listening data yet, so nothing pretends to be "popular" or "for you".
 * Every item says why it is here.
 */
export default async function DiscoverPage({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Discover");
  const tPlaces = await getTranslations("Places");
  const tReleases = await getTranslations("Releases");
  const format = await getFormatter();
  const query = await searchParams;
  const region = parseRegion(query.woj);
  const accountDeleted = query.konto === "usuniete";
  const { releases, artists } = await getDiscover(region);
  const entitlement = await listenerEntitlement();
  const soundchecks = await getSoundchecks(
    releases.map((r) => ({ id: r.release_id, artistName: r.artist_name })),
    entitlement,
  );
  const images = await getImageSourcesMany(
    [...releases.map((r) => r.artwork_image_id), ...artists.map((a) => a.image_id)],
    320,
  );
  const now = new Date();

  const place = (city: string | null, voivodeship: string | null) =>
    [
      city,
      voivodeship
        ? tPlaces("voivodeshipShort", { name: tPlaces(`voivodeship.${voivodeship as "slaskie"}`) })
        : null,
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
        <p className="discover__lead">{t("leadPoland")}</p>
      </header>

      {accountDeleted ? (
        <p role="status" className="form-status">
          {t("accountDeleted")}
        </p>
      ) : null}
      <nav aria-label={t("regionLabel")} className="region-filter">
        <Link
          href="/"
          className="region-filter__chip"
          aria-current={region === null ? "page" : undefined}
        >
          {t("allPoland")}
        </Link>
        {VOIVODESHIPS.map((v) => (
          <Link
            key={v}
            href={{ pathname: "/", query: { woj: v } }}
            className="region-filter__chip"
            aria-current={region === v ? "page" : undefined}
          >
            {tPlaces(`voivodeship.${v}`)}
          </Link>
        ))}
      </nav>

      {releases.length === 0 && artists.length === 0 ? (
        <p className="discover__empty" role="status">
          {region ? t("emptyRegion", { region: tPlaces(`voivodeship.${region}`) }) : t("empty")}
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
                {r.city || r.voivodeship ? (
                  <span className="release-card__place">{place(r.city, r.voivodeship)}</span>
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
                {a.city || a.voivodeship ? (
                  <span className="release-card__place">{place(a.city, a.voivodeship)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
