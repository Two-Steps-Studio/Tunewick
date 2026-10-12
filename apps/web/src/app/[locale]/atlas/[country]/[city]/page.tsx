import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji } from "@/lib/intl";
import { getAtlasCity, parseCountryParam } from "@/modules/atlas";
import { Artwork, getImageSourcesMany } from "@/modules/images";

function cityName(param: string) {
  const raw = decodeURIComponent(param).trim();
  return raw.replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/atlas/[country]/[city]">): Promise<Metadata> {
  const { locale, city } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Atlas" });
  return { title: t("cityTitle", { city: cityName(city) }) };
}

/** A city's scene: artists, genres, venues and upcoming events. */
export default async function AtlasCityPage({
  params,
}: PageProps<"/[locale]/atlas/[country]/[city]">) {
  const { locale, country, city } = await params;
  setRequestLocale(locale as Locale);
  const code = parseCountryParam(country);
  if (!code) notFound();
  const name = cityName(city);
  const [data, t, format] = await Promise.all([
    getAtlasCity(code, name),
    getTranslations("Atlas"),
    getFormatter(),
  ]);
  if (!data) notFound();
  const images = await getImageSourcesMany(
    data.artists.map((a) => a.image_id),
    160,
  );
  const genreName = (g: { name_pl: string; name_en: string }) =>
    locale === "pl" ? g.name_pl : g.name_en;

  return (
    <section className="stats atlas">
      <header className="stats__head">
        <p className="stats__back">
          <Link href={{ pathname: "/atlas/[country]", params: { country: code.toLowerCase() } }}>
            ← {flagEmoji(code)} {countryName(code, locale)}
          </Link>
        </p>
        <h1 className="stats__title">{name}</h1>
        <p className="stats__lead">{t("scene", { count: data.artists.length })}</p>
      </header>

      {data.genres.length ? (
        <ul className="profile-badges" aria-label={t("genres")}>
          {data.genres.map((g) => (
            <li key={g.slug}>{genreName(g)}</li>
          ))}
        </ul>
      ) : null}

      {data.artists.length ? (
        <section aria-labelledby="city-artists" className="stats__section">
          <h2 id="city-artists" className="section-title">
            {t("cityArtists")}
          </h2>
          <ul className="atlas-artists">
            {data.artists.map((a) => (
              <li key={a.slug}>
                <Artwork
                  image={a.image_id ? (images.get(a.image_id) ?? null) : null}
                  alt=""
                  sizes="64px"
                  className="stats-list__art stats-list__art--round"
                />
                <Link href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}>
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.events.length ? (
        <section aria-labelledby="city-events" className="stats__section">
          <h2 id="city-events" className="section-title">
            {t("events")}
          </h2>
          <ul className="atlas-list">
            {data.events.map((e) => (
              <li key={e.id}>
                <Link href={{ pathname: "/venues/[slug]", params: { slug: e.venue_slug } }}>
                  {e.title}
                </Link>
                <span>
                  {format.dateTime(new Date(e.starts_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  · {e.venue}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.venues.length ? (
        <section aria-labelledby="city-venues" className="stats__section">
          <h2 id="city-venues" className="section-title">
            {t("venues")}
          </h2>
          <ul className="atlas-list">
            {data.venues.map((v) => (
              <li key={v.slug}>
                <Link href={{ pathname: "/venues/[slug]", params: { slug: v.slug } }}>
                  {v.name}
                </Link>
                <span>{t("upcoming", { count: v.upcoming })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
