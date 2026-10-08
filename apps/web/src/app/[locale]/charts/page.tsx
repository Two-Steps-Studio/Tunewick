import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ScrollCurrent } from "@/components/feedback/scroll-current";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import {
  ARTIST_CHARTS,
  ChartPlay,
  FRESH_WINDOWS,
  TRACK_CHARTS,
  getArtistChart,
  getFreshReleases,
  getMusicCities,
  getTrackChart,
  getWorldTracks,
  type ArtistChart,
  type ChartQuery,
  type TrackChart,
} from "@/modules/charts";
import {
  getCountryCodes,
  getDiscoveryPreferences,
  getGenres,
  parseCountry,
} from "@/modules/discover";
import { Artwork, getImageSourcesMany } from "@/modules/images";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/charts">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Charts" });
  return { title: t("title") };
}

const TABS = [...TRACK_CHARTS, "artists", "fresh", "world"] as const;
const REGIONS = ["europe", "americas", "asia", "africa", "oceania"] as const;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/**
 * Charts: what people listen to and discover this week — by listeners, never plays. Global, by
 * listeners' country/region ("Popular in …"), by the music's origin, city scene and genre; plus
 * rising and underground artists, fresh releases and "Discover the world".
 */
export default async function ChartsPage({ params, searchParams }: PageProps<"/[locale]/charts">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Charts");
  const format = await getFormatter();
  const query = await searchParams;

  const tab = pick(query.c, TABS, "top");
  const scope = pick(
    query.scope,
    ["global", "country", "region", "city", "genre"] as const,
    "global",
  );
  const country = parseCountry(query.code) ?? null;
  const region = pick(query.code, REGIONS, "europe");
  const genre =
    typeof query.code === "string" && /^[a-z0-9-]{2,40}$/.test(query.code) ? query.code : null;
  const city = typeof query.code === "string" ? query.code.slice(0, 80) : null;
  const cityCountry = parseCountry(query.country) ?? null;
  const chartQuery: ChartQuery =
    scope === "country" && country
      ? { scope, code: country, country: null }
      : scope === "region"
        ? { scope, code: region, country: null }
        : scope === "genre" && genre
          ? { scope, code: genre, country: null }
          : scope === "city" && city
            ? { scope, code: city, country: cityCountry }
            : { scope: "global", code: null, country: null };
  const artistChart = pick(query.a, ARTIST_CHARTS, "rising");
  const hours = Number(query.h) as (typeof FRESH_WINDOWS)[number];
  const freshHours = FRESH_WINDOWS.includes(hours) ? hours : 168;

  const [{ preferences }, countries, genres] = await Promise.all([
    getDiscoveryPreferences(),
    getCountryCodes(),
    getGenres(locale),
  ]);
  const myCountry = preferences.countryCode;
  const sortedCountries = countries
    .map((c) => ({ code: c.code, name: countryName(c.code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug;

  const [tracks, artists, fresh, world, cities] = await Promise.all([
    (TRACK_CHARTS as readonly string[]).includes(tab)
      ? getTrackChart(tab as TrackChart, chartQuery)
      : Promise.resolve([]),
    tab === "artists"
      ? getArtistChart(artistChart as ArtistChart, chartQuery)
      : Promise.resolve([]),
    tab === "fresh"
      ? getFreshReleases(
          freshHours,
          chartQuery.scope === "country" ? chartQuery.code : null,
          genre && scope === "genre" ? genre : null,
        )
      : Promise.resolve([]),
    tab === "world" ? getWorldTracks(myCountry) : Promise.resolve([]),
    chartQuery.scope === "country" && chartQuery.code
      ? getMusicCities(chartQuery.code)
      : chartQuery.scope === "city" && chartQuery.country
        ? getMusicCities(chartQuery.country)
        : Promise.resolve([]),
  ]);
  const images = await getImageSourcesMany(
    [
      ...tracks.map((r) => r.artwork_image_id ?? r.artist_image_id),
      ...artists.map((a) => a.image_id),
      ...fresh.map((r) => r.artwork_image_id),
      ...world.map((w) => w.artwork_image_id),
    ],
    160,
  );

  const scopeLabel =
    chartQuery.scope === "country"
      ? tab === "top"
        ? t("scope.popularIn", { place: countryName(chartQuery.code!, locale) })
        : t("scope.from", { place: countryName(chartQuery.code!, locale) })
      : chartQuery.scope === "region"
        ? tab === "top"
          ? t("scope.popularIn", { place: t(`regions.${region}`) })
          : t("scope.from", { place: t(`regions.${region}`) })
        : chartQuery.scope === "city"
          ? t("scope.city", { city: chartQuery.code! })
          : chartQuery.scope === "genre"
            ? t("scope.genre", { genre: genreName(chartQuery.code!) })
            : t("scope.global");
  const keep = (extra: Record<string, string>) => ({
    ...(tab !== "top" ? { c: tab } : {}),
    ...(chartQuery.scope !== "global" ? { scope: chartQuery.scope } : {}),
    ...(chartQuery.code ? { code: chartQuery.code } : {}),
    ...(chartQuery.country ? { country: chartQuery.country } : {}),
    ...extra,
  });
  const songHref = (artistSlug: string, title: string, code: string) => ({
    pathname: "/song/[artist]/[song]" as const,
    params: { artist: artistSlug, song: songSegment(title, code, slugify) },
  });
  const n = (value: number) => format.number(value);

  return (
    <section className="charts">
      <header className="charts__head">
        <h1 className="charts__title">{t("title")}</h1>
        <p className="charts__lead">{t("lead")}</p>
      </header>

      <ScrollCurrent className="charts__tabs" label={t("tabsLabel")}>
        {TABS.map((item) => (
          <Link
            key={item}
            href={{
              pathname: "/charts",
              query: {
                ...(item !== "top" ? { c: item } : {}),
                ...(chartQuery.scope !== "global" && item !== "world"
                  ? { scope: chartQuery.scope }
                  : {}),
                ...(chartQuery.code && item !== "world" ? { code: chartQuery.code } : {}),
                ...(chartQuery.country && item !== "world" ? { country: chartQuery.country } : {}),
              },
            }}
            className="charts__tab"
            aria-current={item === tab ? "page" : undefined}
          >
            {t(`tabs.${item}`)}
          </Link>
        ))}
      </ScrollCurrent>

      {tab !== "world" ? (
        <div className="charts__scopes">
          <nav className="region-filter" aria-label={t("scopeLabel")}>
            <Link
              href={{ pathname: "/charts", query: tab !== "top" ? { c: tab } : {} }}
              className="region-filter__chip"
              aria-current={chartQuery.scope === "global" ? "page" : undefined}
            >
              {t("scope.global")}
            </Link>
            {myCountry ? (
              <Link
                href={{
                  pathname: "/charts",
                  query: {
                    ...(tab !== "top" ? { c: tab } : {}),
                    scope: "country",
                    code: myCountry,
                  },
                }}
                className="region-filter__chip"
                aria-current={
                  chartQuery.scope === "country" && chartQuery.code === myCountry
                    ? "page"
                    : undefined
                }
              >
                <span aria-hidden="true">{flagEmoji(myCountry)} </span>
                {tab === "top"
                  ? t("scope.popularIn", { place: countryName(myCountry, locale) })
                  : countryName(myCountry, locale)}
              </Link>
            ) : null}
            {REGIONS.map((r) => (
              <Link
                key={r}
                href={{
                  pathname: "/charts",
                  query: { ...(tab !== "top" ? { c: tab } : {}), scope: "region", code: r },
                }}
                className="region-filter__chip"
                aria-current={
                  chartQuery.scope === "region" && chartQuery.code === r ? "page" : undefined
                }
              >
                {t(`regions.${r}`)}
              </Link>
            ))}
          </nav>
          <div className="charts__pickers-row">
            <form className="charts__pickers" action="">
              {tab !== "top" ? <input type="hidden" name="c" value={tab} /> : null}
              <input type="hidden" name="scope" value="country" />
              <label className="visually-hidden" htmlFor="chart-country">
                {t("country")}
              </label>
              <select
                id="chart-country"
                name="code"
                className="field__input"
                defaultValue={chartQuery.scope === "country" ? (chartQuery.code ?? "") : ""}
              >
                <option value="">{t("country")}</option>
                {sortedCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="button">
                {t("show")}
              </button>
            </form>
            <form className="charts__pickers" action="">
              {tab !== "top" ? <input type="hidden" name="c" value={tab} /> : null}
              <input type="hidden" name="scope" value="genre" />
              <label className="visually-hidden" htmlFor="chart-genre">
                {t("genre")}
              </label>
              <select
                id="chart-genre"
                name="code"
                className="field__input"
                defaultValue={chartQuery.scope === "genre" ? (chartQuery.code ?? "") : ""}
              >
                <option value="">{t("genre")}</option>
                {genres.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="button">
                {t("show")}
              </button>
            </form>
          </div>
          {cities.length && tab !== "fresh" ? (
            <nav className="region-filter region-filter--sub" aria-label={t("citiesLabel")}>
              {cities.map((c) => {
                const of = chartQuery.scope === "city" ? chartQuery.country! : chartQuery.code!;
                return (
                  <Link
                    key={c.city}
                    href={{
                      pathname: "/charts",
                      query: {
                        ...(tab !== "top" ? { c: tab } : {}),
                        scope: "city",
                        code: c.city,
                        country: of,
                      },
                    }}
                    className="region-filter__chip"
                    aria-current={
                      chartQuery.scope === "city" &&
                      chartQuery.code?.toLowerCase() === c.city.toLowerCase()
                        ? "page"
                        : undefined
                    }
                  >
                    {c.city}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
      ) : null}

      {tab === "artists" ? (
        <nav className="region-filter region-filter--sub" aria-label={t("artistChartsLabel")}>
          {ARTIST_CHARTS.map((a) => (
            <Link
              key={a}
              href={{ pathname: "/charts", query: keep({ a }) }}
              className="region-filter__chip"
              aria-current={a === artistChart ? "page" : undefined}
            >
              {t(`artistCharts.${a}`)}
            </Link>
          ))}
        </nav>
      ) : null}

      {tab === "fresh" ? (
        <nav className="region-filter region-filter--sub" aria-label={t("freshLabel")}>
          {FRESH_WINDOWS.map((h) => (
            <Link
              key={h}
              href={{ pathname: "/charts", query: keep({ h: String(h) }) }}
              className="region-filter__chip"
              aria-current={h === freshHours ? "page" : undefined}
            >
              {t(`fresh.h${h}`)}
            </Link>
          ))}
        </nav>
      ) : null}

      {(TRACK_CHARTS as readonly string[]).includes(tab) ? (
        <section aria-labelledby="chart-heading" className="charts__section">
          <h2 id="chart-heading" className="charts__heading">
            <span>{t(`tabs.${tab}`)}</span>
            <span className="charts__scope">{scopeLabel}</span>
          </h2>
          <p className="field__hint">{t(`about.${tab as TrackChart}`)}</p>
          {tracks.length ? (
            <ol className="chart-list">
              {tracks.map((row, index) => (
                <li key={row.track_id} className="chart-row" data-top={row.rank <= 3 || undefined}>
                  <span className="chart-row__rank">{row.rank}</span>
                  <Artwork
                    image={images.get(row.artwork_image_id ?? row.artist_image_id ?? "") ?? null}
                    alt=""
                    sizes="3.25rem"
                    className="chart-row__art"
                  />
                  <span className="chart-row__main">
                    <Link
                      href={songHref(row.artist_slug, row.title, row.public_code)}
                      className="chart-row__title"
                    >
                      {row.title}
                    </Link>
                    <span className="chart-row__artist">
                      <Link
                        href={{ pathname: "/artists/[slug]", params: { slug: row.artist_slug } }}
                      >
                        {row.artist_name}
                      </Link>
                      {row.artist_country ? (
                        <span aria-label={countryName(row.artist_country, locale)}>
                          {" "}
                          {flagEmoji(row.artist_country)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="chart-row__value">
                    {t(`values.${tab as TrackChart}`, { count: row.value, value: n(row.value) })}
                    {row.growth !== null && (tab === "rising" || tab === "top") ? (
                      <span className="chart-row__growth" data-up={row.growth > 0 || undefined}>
                        {row.growth > 0 ? "+" : ""}
                        {row.growth}%
                      </span>
                    ) : tab === "rising" ? (
                      <span className="chart-row__growth" data-up>
                        {t("new")}
                      </span>
                    ) : null}
                  </span>
                  <ChartPlay
                    trackIds={tracks.slice(index).map((r) => r.track_id)}
                    label={t("playFrom", { title: row.title, artist: row.artist_name })}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <EmptyChart text={t(`empty.${tab as TrackChart}`)} cta={t("emptyCta")} />
          )}
        </section>
      ) : null}

      {tab === "artists" ? (
        <section aria-labelledby="artist-chart-heading" className="charts__section">
          <h2 id="artist-chart-heading" className="charts__heading">
            <span>{t(`artistCharts.${artistChart}`)}</span>
            <span className="charts__scope">{scopeLabel}</span>
          </h2>
          <p className="field__hint">{t(`aboutArtists.${artistChart}`)}</p>
          {artists.length ? (
            <ol className="chart-list">
              {artists.map((a) => (
                <li key={a.artist_id} className="chart-row" data-top={a.rank <= 3 || undefined}>
                  <span className="chart-row__rank">{a.rank}</span>
                  <Artwork
                    image={images.get(a.image_id ?? "") ?? null}
                    alt=""
                    sizes="3.25rem"
                    className="chart-row__art artwork--round"
                  />
                  <span className="chart-row__main">
                    <Link
                      href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}
                      className="chart-row__title"
                    >
                      {a.name}
                    </Link>
                    <span className="chart-row__artist">
                      {[a.city, a.country_code ? countryName(a.country_code, locale) : null]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                  <span className="chart-row__value">
                    {t(`artistValues.${artistChart}`, { count: a.value, value: n(a.value) })}
                    {a.growth !== null && artistChart === "rising" ? (
                      <span className="chart-row__growth" data-up={a.growth > 0 || undefined}>
                        +{a.growth}%
                      </span>
                    ) : null}
                  </span>
                  <Link
                    href={{ pathname: "/", query: { artist: a.slug } }}
                    className="chart-row__play"
                    aria-label={t("discoverArtist", { name: a.name })}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyChart text={t("emptyArtists")} cta={t("emptyCta")} />
          )}
        </section>
      ) : null}

      {tab === "fresh" ? (
        <section aria-labelledby="fresh-heading" className="charts__section">
          <h2 id="fresh-heading" className="charts__heading">
            <span>{t(`fresh.h${freshHours}`)}</span>
            <span className="charts__scope">{scopeLabel}</span>
          </h2>
          {fresh.length ? (
            <ul className="release-grid">
              {fresh.map((r) => (
                <li key={r.release_id} className="release-card">
                  <Link
                    href={{
                      pathname: "/artists/[slug]/releases/[release]",
                      params: { slug: r.artist_slug, release: r.slug },
                    }}
                    className="release-card__link"
                  >
                    <Artwork
                      image={images.get(r.artwork_image_id ?? "") ?? null}
                      alt=""
                      sizes="(min-width: 1024px) 14rem, 45vw"
                    />
                    <span className="release-card__title">{r.title}</span>
                  </Link>
                  <span className="release-card__artist">
                    <Link href={{ pathname: "/artists/[slug]", params: { slug: r.artist_slug } }}>
                      {r.artist_name}
                    </Link>
                    {r.artist_country ? ` ${flagEmoji(r.artist_country)}` : ""}
                  </span>
                  <span className="release-card__reason">
                    {format.relativeTime(new Date(r.publish_at), new Date())}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChart text={t("emptyFresh")} cta={t("emptyCta")} />
          )}
        </section>
      ) : null}

      {tab === "world" ? (
        <section aria-labelledby="world-heading" className="charts__section">
          <h2 id="world-heading" className="charts__heading">
            <span>{t("world.title")}</span>
          </h2>
          <p className="field__hint">
            {myCountry
              ? t("world.leadOutside", { country: countryName(myCountry, locale) })
              : t("world.lead")}
          </p>
          {world.length ? (
            <ul className="world-grid">
              {world.map((w) => (
                <li key={w.country_code} className="world-card">
                  <Link
                    href={{
                      pathname: "/charts",
                      query: { c: "discovered", scope: "country", code: w.country_code },
                    }}
                    className="world-card__country"
                  >
                    <span aria-hidden="true">{flagEmoji(w.country_code)}</span>{" "}
                    {countryName(w.country_code, locale)}
                  </Link>
                  <Artwork
                    image={images.get(w.artwork_image_id ?? "") ?? null}
                    alt=""
                    sizes="(min-width: 1024px) 12rem, 45vw"
                  />
                  <Link
                    href={songHref(w.artist_slug, w.title, w.public_code)}
                    className="world-card__title"
                  >
                    {w.title}
                  </Link>
                  <span className="world-card__artist">{w.artist_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChart text={t("world.empty")} cta={t("emptyCta")} />
          )}
        </section>
      ) : null}
    </section>
  );
}

function EmptyChart({ text, cta }: { text: string; cta: string }) {
  return (
    <div className="charts__empty" role="status">
      <p>{text}</p>
      <Link href="/" className="button button--primary">
        {cta}
      </Link>
    </div>
  );
}
