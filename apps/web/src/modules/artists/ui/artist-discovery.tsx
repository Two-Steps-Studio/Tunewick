import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { countryName, flagEmoji } from "@/lib/intl";
import { BarChart } from "@/modules/progress";
import {
  getArtistDiscoveryStats,
  getArtistDiscoveryWeeks,
  getWhyArtistForMe,
  type ArtistDiscoveryStats,
} from "../queries";

function growth(stats: ArtistDiscoveryStats) {
  if (stats.listeners_7d == null || !stats.listeners_prev_7d) return null;
  return (stats.listeners_7d - stats.listeners_prev_7d) / stats.listeners_prev_7d;
}

/**
 * The artist's discovery side on their public page: listeners and growth, how many discovered
 * them, Rising, where listeners are, and why the signed-in listener might like them. Aggregates
 * only; anything under 3 listeners says "fewer than 3" instead of a number.
 */
export async function ArtistDiscovery({ artistId, name }: { artistId: string; name: string }) {
  const [stats, why, t, format, locale] = await Promise.all([
    getArtistDiscoveryStats(artistId),
    getWhyArtistForMe(artistId),
    getTranslations("ArtistDiscovery"),
    getFormatter(),
    getLocale(),
  ]);
  if (!stats) return null;
  const n = (value: number | null) => (value == null ? t("fewer") : format.number(value));
  const change = growth(stats);
  const reasons = why
    ? [
        ...(why.friends.length
          ? [
              t("why.friends", {
                names: why.friends
                  .slice(0, 3)
                  .map((f) => f.name)
                  .join(", "),
              }),
            ]
          : []),
        ...(why.related.length
          ? [
              t("why.related", {
                artists: why.related
                  .slice(0, 3)
                  .map((a) => a.name)
                  .join(", "),
              }),
            ]
          : []),
        ...(why.genres.length
          ? [
              t("why.genres", {
                genres: why.genres
                  .slice(0, 3)
                  .map((g) => (locale === "pl" ? g.name_pl : g.name_en))
                  .join(", "),
              }),
            ]
          : []),
      ]
    : [];

  return (
    <section aria-labelledby="artist-discovery" className="discover__section artist-discovery">
      <h2 id="artist-discovery" className="section-title">
        {t("title")}
        {stats.rising_place ? (
          <span className="artist-discovery__rising">
            {t("rising", { place: stats.rising_place })}
          </span>
        ) : null}
      </h2>
      {stats.listeners_30d == null ? (
        <p className="artist-discovery__early">{t("early", { name })}</p>
      ) : (
        <dl className="stat-grid">
          <div className="stat-tile">
            <dt>{t("listeners30")}</dt>
            <dd>{n(stats.listeners_30d)}</dd>
          </div>
          <div className="stat-tile">
            <dt>{t("listeners7")}</dt>
            <dd>
              {n(stats.listeners_7d)}
              {change != null ? (
                <small className="artist-discovery__change">
                  {format.number(change, { style: "percent", signDisplay: "exceptZero" })}
                </small>
              ) : null}
            </dd>
          </div>
          <div className="stat-tile">
            <dt>{t("discovered")}</dt>
            <dd>{n(stats.discovered_30d)}</dd>
          </div>
          <div className="stat-tile">
            <dt>{t("score")}</dt>
            <dd>{stats.score_30d == null ? "-" : format.number(stats.score_30d)}</dd>
          </div>
        </dl>
      )}
      {stats.places.countries.length || stats.places.cities.length ? (
        <p className="artist-discovery__places">
          {t("places")}{" "}
          {[
            ...stats.places.countries
              .slice(0, 5)
              .map((c) => `${flagEmoji(c.code)} ${countryName(c.code, locale)}`),
            ...stats.places.cities.slice(0, 3).map((c) => c.city),
          ].join(" · ")}
        </p>
      ) : null}
      <p className="field__hint">{t("hint")}</p>
      {why && !why.listened && reasons.length ? (
        <div className="artist-discovery__why">
          <h3>{t("why.title", { name })}</h3>
          <ul>
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The team's view: weekly new listeners and listeners for 12 weeks, plus where listeners are. */
export async function ArtistDiscoveryTeam({ artistId }: { artistId: string }) {
  const [weeks, stats, t, format, locale] = await Promise.all([
    getArtistDiscoveryWeeks(artistId),
    getArtistDiscoveryStats(artistId),
    getTranslations("ArtistDiscovery"),
    getFormatter(),
    getLocale(),
  ]);
  const label = (week: string) =>
    format.dateTime(new Date(`${week}T12:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const bars = (key: "new_listeners" | "listeners") =>
    weeks.map((w) => ({
      label: label(w.week),
      name: t("team.week", { date: label(w.week) }),
      value: w[key],
      display: format.number(w[key]),
    }));
  const any = weeks.some((w) => w.listeners > 0);
  return (
    <section className="settings-form__group artist-discovery" aria-labelledby="team-discovery">
      <h2 id="team-discovery" className="section-title">
        {t("team.title")}
      </h2>
      <p className="field__hint">{t("team.lead")}</p>
      {any ? (
        <div className="stats__pair">
          <BarChart
            title={t("team.newListeners")}
            bars={bars("new_listeners")}
            tableLabel={t("team.table")}
            columns={[t("team.weekColumn"), t("team.newListeners")]}
            labelEvery={3}
          />
          <BarChart
            title={t("team.listeners")}
            bars={bars("listeners")}
            tableLabel={t("team.table")}
            columns={[t("team.weekColumn"), t("team.listeners")]}
            labelEvery={3}
          />
        </div>
      ) : (
        <p className="field__hint">{t("team.empty")}</p>
      )}
      {stats && (stats.places.countries.length || stats.places.cities.length) ? (
        <dl className="stats-kv">
          {stats.places.countries.length ? (
            <div>
              <dt>{t("team.countries")}</dt>
              <dd>
                {stats.places.countries
                  .map(
                    (c) =>
                      `${flagEmoji(c.code)} ${countryName(c.code, locale)} (${format.number(c.listeners)})`,
                  )
                  .join(", ")}
              </dd>
            </div>
          ) : null}
          {stats.places.cities.length ? (
            <div>
              <dt>{t("team.cities")}</dt>
              <dd>
                {stats.places.cities
                  .map((c) => `${c.city} (${format.number(c.listeners)})`)
                  .join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <p className="field__hint">
        <Link href="/charts">{t("team.charts")}</Link>
      </p>
    </section>
  );
}
