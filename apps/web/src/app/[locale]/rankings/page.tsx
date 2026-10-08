import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji } from "@/lib/intl";
import { getCountryCodes, getDiscoveryPreferences, ViewEvent } from "@/modules/discover";
import { currentSeason } from "@tunewick/shared";
import { getLeaderboard, type RankingPeriod } from "@/modules/progress";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/rankings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Rankings" });
  return { title: t("title") };
}

const PERIODS: RankingPeriod[] = ["week", "month", "season", "last_season", "all"];
const REGIONS = ["europe", "americas", "asia", "africa", "oceania"] as const;

/**
 * Top discoverers — ranked by discovery points (new songs, artists, genres, countries, saves),
 * never by listening time. Listed: listeners with a public handle who did not opt out.
 */
export default async function RankingsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/rankings">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Rankings");
  const format = await getFormatter();
  const query = await searchParams;
  const period = PERIODS.includes(query.period as RankingPeriod)
    ? (query.period as RankingPeriod)
    : "week";
  const country =
    typeof query.country === "string" && /^[A-Z]{2}$/.test(query.country) ? query.country : null;
  const region =
    !country && REGIONS.includes(query.region as (typeof REGIONS)[number])
      ? (query.region as string)
      : null;
  const [{ rows, me, signedIn }, countries, { preferences }] = await Promise.all([
    getLeaderboard({ period, country, region }),
    getCountryCodes(),
    getDiscoveryPreferences(),
  ]);
  const season = currentSeason();
  const scopeName = country
    ? countryName(country, locale)
    : region
      ? t(`regions.${region as "europe"}`)
      : t("global");
  const keep = { ...(country ? { country } : {}), ...(region ? { region } : {}) };
  const sortedCountries = countries
    .map((c) => ({ code: c.code, name: countryName(c.code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <section className="rankings">
      <ViewEvent name="ranking_viewed" />
      <h1 className="you__title">{t("title")}</h1>
      <p className="you__lead">{t("lead")}</p>

      <nav className="region-filter" aria-label={t("period")}>
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={{ pathname: "/rankings", query: { ...keep, period: p } }}
            className="region-filter__chip"
            aria-current={p === period ? "page" : undefined}
          >
            {t(`periods.${p}`)}
          </Link>
        ))}
      </nav>
      <nav className="region-filter region-filter--sub" aria-label={t("scope")}>
        <Link
          href={{ pathname: "/rankings", query: { period } }}
          className="region-filter__chip"
          aria-current={!country && !region ? "page" : undefined}
        >
          {t("global")}
        </Link>
        {preferences.countryCode ? (
          <Link
            href={{ pathname: "/rankings", query: { period, country: preferences.countryCode } }}
            className="region-filter__chip"
            aria-current={country === preferences.countryCode ? "page" : undefined}
          >
            <span aria-hidden="true">{flagEmoji(preferences.countryCode)} </span>
            {countryName(preferences.countryCode, locale)}
          </Link>
        ) : null}
        {REGIONS.map((r) => (
          <Link
            key={r}
            href={{ pathname: "/rankings", query: { period, region: r } }}
            className="region-filter__chip"
            aria-current={region === r ? "page" : undefined}
          >
            {t(`regions.${r}`)}
          </Link>
        ))}
      </nav>
      <form className="rankings__country" action="">
        <input type="hidden" name="period" value={period} />
        <label className="field__label" htmlFor="ranking-country">
          {t("country")}
        </label>
        <select
          id="ranking-country"
          name="country"
          className="field__input"
          defaultValue={country ?? ""}
        >
          <option value="">{t("global")}</option>
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

      <h2 className="section-title">
        {t("heading", { scope: scopeName, period: t(`periods.${period}`) })}
      </h2>
      {period === "season" ? (
        <p className="field__hint">
          {t("seasonEnds", {
            season: t("seasonName", { quarter: season.quarter, year: season.year }),
            date: format.dateTime(season.endsAt, { dateStyle: "long", timeZone: "UTC" }),
          })}
        </p>
      ) : null}
      {me ? (
        <p className="rankings__me">
          {t("you", {
            rank: me.rank,
            participants: me.participants,
            points: format.number(me.points),
          })}
          {me.percentile !== null ? ` · ${t("percentile", { percentile: me.percentile })}` : ""}
          {!me.listed ? (
            <>
              {" "}
              <Link href="/settings">{t("notListed")}</Link>
            </>
          ) : null}
        </p>
      ) : signedIn ? (
        <p className="field__hint">{t("notRanked")}</p>
      ) : (
        <p className="field__hint">
          <Link href="/login">{t("signIn")}</Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="discover__empty" role="status">
          {t("empty")}
        </p>
      ) : (
        <ol className="leaderboard">
          {rows.map((row) => (
            <li
              key={`${row.rank}-${row.handle}`}
              className="leaderboard__row"
              data-me={row.is_me || undefined}
            >
              <span className="leaderboard__rank">{row.rank}</span>
              <Link
                href={{ pathname: "/profile/[handle]", params: { handle: row.handle } }}
                className="leaderboard__name"
              >
                {row.display_name ?? row.handle}
              </Link>
              <span className="leaderboard__discoveries">
                {t("discoveries", { count: row.discoveries })}
              </span>
              <span className="leaderboard__points">
                {t("points", { points: format.number(row.points) })}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="field__hint">{t("fair")}</p>
    </section>
  );
}
