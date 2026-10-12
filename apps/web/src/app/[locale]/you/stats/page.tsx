import type { Metadata } from "next";
import { musicPersonality } from "@tunewick/shared";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji, formatListening, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { getOptionalUser } from "@/modules/auth";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import {
  BarChart,
  getMyListeningStats,
  LISTENING_PERIODS,
  type Bar,
  type ListeningPeriod,
  type ListeningStats,
} from "@/modules/progress";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/you/stats">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Stats" });
  return { title: t("title") };
}

/** Every local day of the period with its listening (days without any are zero). */
function dailyBars(stats: ListeningStats) {
  const byDay = new Map(stats.by_day.map((d) => [d.day, d.ms]));
  const days: { day: string; ms: number }[] = [];
  for (let d = new Date(`${stats.starts}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (day >= stats.ends) break;
    days.push({ day, ms: byDay.get(day) ?? 0 });
  }
  return days;
}

/** Your statistics: totals, listening over time, by hour and weekday, tops, discoveries, personality. */
export default async function StatsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/you/stats">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Stats");
  const user = await getOptionalUser();
  if (!user) {
    return (
      <section className="stats">
        <h1 className="stats__title">{t("title")}</h1>
        <p className="stats__lead">{t("signedOut")}</p>
        <Link href="/login" className="button button--primary">
          {t("signIn")}
        </Link>
      </section>
    );
  }

  const query = await searchParams;
  const period = LISTENING_PERIODS.includes(query.period as ListeningPeriod)
    ? (query.period as ListeningPeriod)
    : "30d";
  const [stats, format] = await Promise.all([getMyListeningStats(period), getFormatter()]);
  const n = (value: number) => format.number(Number(value));
  const dateOf = (day: string) => new Date(`${day}T12:00:00Z`);
  const genreName = (g: { name_pl: string; name_en: string }) =>
    locale === "pl" ? g.name_pl : g.name_en;
  const images = await getImageSourcesMany(
    [
      ...stats.top_artists.map((a) => a.image_id),
      ...stats.top_tracks.map((s) => s.artwork_image_id),
      stats.biggest_discovery?.image_id ?? null,
    ],
    160,
  );
  const image = (id: string | null) => (id ? (images.get(id) ?? null) : null);

  const periods = (
    <nav className="region-filter" aria-label={t("period")}>
      {LISTENING_PERIODS.map((p) => (
        <Link
          key={p}
          href={{ pathname: "/you/stats", query: p === "30d" ? {} : { period: p } }}
          className="region-filter__chip"
          aria-current={p === period ? "page" : undefined}
        >
          {t(`periods.${p}`)}
        </Link>
      ))}
    </nav>
  );

  if (Number(stats.plays) === 0 && Number(stats.listening_ms) === 0) {
    return (
      <section className="stats">
        <header className="stats__head">
          <h1 className="stats__title">{t("title")}</h1>
          {periods}
        </header>
        <div className="empty-state">
          <p>{t("empty")}</p>
          <Link href="/" className="button button--primary">
            {t("startListening")}
          </Link>
        </div>
      </section>
    );
  }

  // Listening over time: days up to 90, months for the year.
  const days = dailyBars(stats);
  const timeBars: Bar[] =
    period === "year"
      ? Array.from({ length: 12 }, (_, month) => {
          const key = `${stats.starts.slice(0, 4)}-${String(month + 1).padStart(2, "0")}`;
          const ms = days.filter((d) => d.day.startsWith(key)).reduce((s, d) => s + d.ms, 0);
          const date = dateOf(`${key}-01`);
          return {
            label: format.dateTime(date, { month: "narrow", timeZone: "UTC" }),
            name: format.dateTime(date, { month: "long", timeZone: "UTC" }),
            value: ms,
            display: formatListening(ms),
          };
        })
      : days.map((d) => ({
          label: format.dateTime(dateOf(d.day), { day: "numeric", timeZone: "UTC" }),
          name: format.dateTime(dateOf(d.day), { dateStyle: "medium", timeZone: "UTC" }),
          value: d.ms,
          display: formatListening(d.ms),
        }));
  const hourBars: Bar[] = stats.hours.map((plays, hour) => ({
    label: String(hour),
    name: t("hourName", { hour }),
    value: plays,
    display: t("playsCount", { count: plays }),
  }));
  // ISO weekdays, Monday first; 2024-01-01 was a Monday.
  const weekdayBars: Bar[] = stats.weekdays.map((ms, i) => {
    const date = dateOf(`2024-01-0${i + 1}`);
    return {
      label: format.dateTime(date, { weekday: "short", timeZone: "UTC" }),
      name: format.dateTime(date, { weekday: "long", timeZone: "UTC" }),
      value: ms,
      display: formatListening(ms),
    };
  });
  const busiestHour = stats.hours.indexOf(Math.max(...stats.hours));

  const tiles = [
    ["listening", formatListening(Number(stats.listening_ms))],
    ["plays", n(stats.plays)],
    ["activeDays", n(stats.active_days)],
    ["songs", n(stats.tracks)],
    ["artists", n(stats.artists)],
    ["albums", n(stats.albums)],
    ["genres", n(stats.genres)],
    ["countries", n(stats.countries)],
    ["newSongs", n(stats.new_songs)],
    ["newArtists", n(stats.new_artists)],
    ["underground", n(stats.underground)],
    ["xp", n(stats.xp)],
  ] as const;

  const personality = musicPersonality({
    plays: Number(stats.plays),
    tracks: Number(stats.tracks),
    artists: Number(stats.artists),
    countries: Number(stats.countries),
    night_plays: Number(stats.night_plays),
    new_artists: Number(stats.new_artists),
    underground: Number(stats.underground),
    top_genres: stats.top_genres.map((g) => ({ plays: Number(g.plays) })),
  });
  const traitValue = (p: string, value: number) =>
    p === "global_discoverer"
      ? n(value)
      : p === "repeat_master"
        ? format.number(value, { maximumFractionDigits: 1 })
        : format.number(value, { style: "percent" });

  return (
    <section className="stats">
      <header className="stats__head">
        <p className="stats__back">
          <Link href="/you">{t("back")}</Link>
        </p>
        <h1 className="stats__title">{t("title")}</h1>
        <p className="stats__lead">
          {format.dateTimeRange(dateOf(stats.starts), dateOf(stats.ends), {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
        </p>
        {periods}
      </header>

      <dl className="stat-grid">
        {tiles.map(([key, value]) => (
          <div key={key} className="stat-tile">
            <dt>{t(`labels.${key}`)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {personality ? (
        <section aria-labelledby="personality" className="stats__section personality">
          <p className="personality__eyebrow">{t("personality.title")}</p>
          <h2 id="personality" className="personality__name">
            {t(`personality.types.${personality.personality}.name`)}
          </h2>
          <p className="personality__text">
            {t(`personality.types.${personality.personality}.text`)}
          </p>
          {personality.traits.length ? (
            <ul className="personality__traits">
              {personality.traits.map((trait) => (
                <li key={trait.personality}>
                  {t(`personality.types.${trait.personality}.trait`, {
                    value: traitValue(trait.personality, trait.value),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <p className="field__hint">{t("personality.notYet")}</p>
      )}

      <section aria-labelledby="time" className="stats__section">
        <h2 id="time" className="section-title">
          {t("charts.time")}
        </h2>
        <BarChart
          title={t(period === "year" ? "charts.byMonth" : "charts.byDay")}
          bars={timeBars}
          tableLabel={t("charts.table")}
          columns={[t(period === "year" ? "charts.month" : "charts.day"), t("labels.listening")]}
          labelEvery={period === "7d" || period === "year" ? 1 : period === "30d" ? 5 : 14}
        />
        <div className="stats__pair">
          <BarChart
            title={t("charts.byHour")}
            bars={hourBars}
            tableLabel={t("charts.table")}
            columns={[t("charts.hour"), t("labels.plays")]}
            labelEvery={6}
          />
          <BarChart
            title={t("charts.byWeekday")}
            bars={weekdayBars}
            tableLabel={t("charts.table")}
            columns={[t("charts.weekday"), t("labels.listening")]}
          />
        </div>
        <ul className="stats__facts">
          {stats.top_day ? (
            <li>
              {t("facts.topDay", {
                day: format.dateTime(dateOf(stats.top_day.day), {
                  dateStyle: "long",
                  timeZone: "UTC",
                }),
                time: formatListening(Number(stats.top_day.ms)),
              })}
            </li>
          ) : null}
          {Number(stats.plays) > 0 ? <li>{t("facts.topHour", { hour: busiestHour })}</li> : null}
          {Number(stats.longest_session_ms) > 0 ? (
            <li>
              {t("facts.session", { time: formatListening(Number(stats.longest_session_ms)) })}
            </li>
          ) : null}
          {Number(stats.longest_streak) > 0 ? (
            <li>{t("facts.streak", { count: Number(stats.longest_streak) })}</li>
          ) : null}
          {Number(stats.plays) > 0 ? (
            <li>
              {t("facts.night", {
                share: format.number(Number(stats.night_plays) / Number(stats.plays), {
                  style: "percent",
                }),
              })}
            </li>
          ) : null}
        </ul>
      </section>

      <div className="stats__tops">
        <section aria-labelledby="top-artists" className="stats__section">
          <h2 id="top-artists" className="section-title">
            {t("tops.artists")}
          </h2>
          <ol className="stats-list">
            {stats.top_artists.map((a) => (
              <li key={a.id}>
                <Artwork
                  image={image(a.image_id)}
                  alt=""
                  sizes="48px"
                  className="stats-list__art stats-list__art--round"
                />
                <Link href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}>
                  {a.name}
                </Link>
                <span>{t("playsCount", { count: Number(a.plays) })}</span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="top-songs" className="stats__section">
          <h2 id="top-songs" className="section-title">
            {t("tops.songs")}
          </h2>
          <ol className="stats-list">
            {stats.top_tracks.map((s) => (
              <li key={s.id}>
                <Artwork
                  image={image(s.artwork_image_id)}
                  alt=""
                  sizes="48px"
                  className="stats-list__art"
                />
                <span className="stats-list__name">
                  <Link
                    href={{
                      pathname: "/song/[artist]/[song]",
                      params: {
                        artist: s.artist_slug,
                        song: songSegment(s.title, s.code, slugify),
                      },
                    }}
                  >
                    {s.title}
                  </Link>
                  <small>{s.artist}</small>
                </span>
                <span>{t("playsCount", { count: Number(s.plays) })}</span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="top-more" className="stats__section">
          <h2 id="top-more" className="section-title">
            {t("tops.more")}
          </h2>
          <dl className="stats-kv">
            {stats.top_albums[0] ? (
              <div>
                <dt>{t("tops.album")}</dt>
                <dd>
                  <Link
                    href={{
                      pathname: "/artists/[slug]/releases/[release]",
                      params: {
                        slug: stats.top_albums[0].artist_slug,
                        release: stats.top_albums[0].slug,
                      },
                    }}
                  >
                    {stats.top_albums[0].title}
                  </Link>{" "}
                  · {stats.top_albums[0].artist}
                </dd>
              </div>
            ) : null}
            {stats.top_genres.length ? (
              <div>
                <dt>{t("tops.genres")}</dt>
                <dd>{stats.top_genres.map(genreName).join(", ")}</dd>
              </div>
            ) : null}
            {stats.top_countries.length ? (
              <div>
                <dt>{t("tops.countries")}</dt>
                <dd>
                  {stats.top_countries
                    .map((c) => `${flagEmoji(c.code)} ${countryName(c.code, locale)}`)
                    .join(", ")}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      <section aria-labelledby="discoveries" className="stats__section">
        <h2 id="discoveries" className="section-title">
          {t("discoveries.title")}
        </h2>
        <dl className="stat-grid">
          {(
            [
              ["newGenres", stats.new_genres],
              ["newCountries", stats.new_countries],
              ["discoveryXp", stats.discovery_xp],
              ["achievements", stats.achievements],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="stat-tile">
              <dt>{t(`labels.${key}`)}</dt>
              <dd>{n(value)}</dd>
            </div>
          ))}
        </dl>
        {stats.biggest_discovery ? (
          <div className="stats__highlight">
            <Artwork
              image={image(stats.biggest_discovery.image_id)}
              alt=""
              sizes="64px"
              className="stats-list__art stats-list__art--round"
            />
            <p>
              {t.rich("discoveries.biggest", {
                artist: () => (
                  <Link
                    href={{
                      pathname: "/artists/[slug]",
                      params: { slug: stats.biggest_discovery!.slug },
                    }}
                  >
                    {stats.biggest_discovery!.name}
                  </Link>
                ),
                time: formatListening(Number(stats.biggest_discovery.ms)),
              })}
            </p>
          </div>
        ) : null}
        {stats.top_discovered_genre ? (
          <p className="field__hint">
            {t("discoveries.genre", {
              genre: genreName(stats.top_discovered_genre),
              count: Number(stats.top_discovered_genre.songs),
            })}
          </p>
        ) : null}
      </section>
    </section>
  );
}
