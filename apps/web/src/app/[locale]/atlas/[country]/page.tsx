import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji } from "@/lib/intl";
import { getAtlasCountry, parseCountryParam } from "@/modules/atlas";
import { Artwork, getImageSourcesMany } from "@/modules/images";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/atlas/[country]">): Promise<Metadata> {
  const { locale, country } = await params;
  const code = parseCountryParam(country);
  const t = await getTranslations({ locale: locale as Locale, namespace: "Atlas" });
  return code ? { title: t("countryTitle", { country: countryName(code, locale) }) } : {};
}

/** A country: its cities and scenes, genres, and the artists people listen to most. */
export default async function AtlasCountryPage({ params }: PageProps<"/[locale]/atlas/[country]">) {
  const { locale, country } = await params;
  setRequestLocale(locale as Locale);
  const code = parseCountryParam(country);
  if (!code) notFound();
  const [data, t, format] = await Promise.all([
    getAtlasCountry(code),
    getTranslations("Atlas"),
    getFormatter(),
  ]);
  if (!data) notFound();
  const images = await getImageSourcesMany(
    data.top_artists.map((a) => a.image_id),
    160,
  );
  const genreName = (g: { name_pl: string; name_en: string }) =>
    locale === "pl" ? g.name_pl : g.name_en;

  return (
    <section className="stats atlas">
      <header className="stats__head">
        <p className="stats__back">
          <Link href="/atlas">{t("back")}</Link>
        </p>
        <h1 className="stats__title">
          {flagEmoji(code)} {countryName(code, locale)}
        </h1>
        <p className="stats__lead">{t("artists", { count: data.artists })}</p>
        <p>
          <Link
            href={{ pathname: "/charts", query: { scope: "country", code } }}
            className="button"
          >
            {t("charts")}
          </Link>
        </p>
      </header>

      {data.cities.length ? (
        <section aria-labelledby="cities" className="stats__section">
          <h2 id="cities" className="section-title">
            {t("cities")}
          </h2>
          <ul className="atlas-list">
            {data.cities.map((c) => (
              <li key={c.city}>
                <Link
                  href={{
                    pathname: "/atlas/[country]/[city]",
                    params: { country: code.toLowerCase(), city: c.city.toLowerCase() },
                  }}
                >
                  {c.city}
                </Link>
                <span>{t("artists", { count: c.artists })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.genres.length ? (
        <section aria-labelledby="genres" className="stats__section">
          <h2 id="genres" className="section-title">
            {t("genres")}
          </h2>
          <ul className="profile-badges">
            {data.genres.map((g) => (
              <li key={g.slug}>
                {genreName(g)} · {format.number(g.artists)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="top" className="stats__section">
        <h2 id="top" className="section-title">
          {t("topArtists")}
        </h2>
        <ul className="atlas-artists">
          {data.top_artists.map((a) => (
            <li key={a.slug}>
              <Artwork
                image={a.image_id ? (images.get(a.image_id) ?? null) : null}
                alt=""
                sizes="64px"
                className="stats-list__art stats-list__art--round"
              />
              <Link href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}>{a.name}</Link>
              <small>
                {[
                  a.city,
                  a.listeners_30d
                    ? t("listeners30", { count: format.number(a.listeners_30d) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
