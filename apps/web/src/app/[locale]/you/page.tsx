import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatListening } from "@/lib/intl";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOptionalUser } from "@/modules/auth";
import { ViewEvent } from "@/modules/discover";
import { getMyFollowing } from "@/modules/social";
import {
  getMyAchievements,
  getMyProgress,
  getMyRecords,
  getMyStats,
  getMyWeeklyRecap,
  type StatsPeriod,
} from "@/modules/progress";

export async function generateMetadata({ params }: PageProps<"/[locale]/you">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "You" });
  return { title: t("title") };
}

const PERIODS: StatsPeriod[] = ["week", "month", "all"];

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span style={{ transform: `scaleX(${max ? Math.min(1, value / max) : 0})` }} />
    </div>
  );
}

/** You: Discovery Score and level, streak, goals, stats, records, achievements, weekly recap. */
export default async function YouPage({ params, searchParams }: PageProps<"/[locale]/you">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("You");
  const user = await getOptionalUser();

  if (!user) {
    return (
      <section className="you">
        <h1 className="you__title">{t("title")}</h1>
        <p className="you__lead">{t("signedOut")}</p>
        <Link href="/login" className="button button--primary">
          {t("signIn")}
        </Link>
        <PointRules />
      </section>
    );
  }

  const query = await searchParams;
  const period = PERIODS.includes(query.period as StatsPeriod)
    ? (query.period as StatsPeriod)
    : "week";
  const format = await getFormatter();
  const [progress, stats, records, recap, achievements, following] = await Promise.all([
    getMyProgress(),
    getMyStats(period),
    getMyRecords(),
    getMyWeeklyRecap(1),
    getMyAchievements(),
    getMyFollowing(),
  ]);
  if (!progress) return null;
  const n = (value: number) => format.number(value);
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const recapEmpty = recap.listening_ms === 0 && recap.new_songs === 0;

  const tiles = stats
    ? ([
        ["listening", formatListening(Number(stats.listening_ms))],
        ["plays", n(stats.plays)],
        ["songs", n(stats.unique_songs)],
        ["artists", n(stats.unique_artists)],
        ["releases", n(stats.unique_releases)],
        ["genres", n(stats.unique_genres)],
        ["countries", n(stats.countries)],
        ["newArtists", n(stats.new_artists)],
        ["newSongs", n(stats.new_songs)],
        ["saves", n(stats.saves)],
        ["follows", n(stats.follows)],
        ["points", n(stats.points)],
      ] as const)
    : [];

  return (
    <section className="you">
      <header className="you__head">
        <h1 className="you__title">{t("title")}</h1>
        <div className="score-card">
          <p className="score-card__label">{t("score")}</p>
          <p className="score-card__value">{n(progress.score)}</p>
          <p className="score-card__level">
            {t("level", { level: progress.level.level })} · {t(`levels.${progress.level.title}`)}
          </p>
          <Meter
            value={progress.score - progress.level.floor}
            max={progress.level.next - progress.level.floor}
            label={t("toNextLevel", { level: progress.level.level + 1 })}
          />
          <p className="score-card__hint">
            {t("toNextLevelPoints", {
              score: n(progress.level.next - progress.score),
              level: progress.level.level + 1,
            })}
          </p>
          <dl className="score-card__facts">
            <div>
              <dt>{t("points")}</dt>
              <dd>{n(progress.pointsTotal)}</dd>
            </div>
            <div>
              <dt>{t("today")}</dt>
              <dd>+{n(progress.pointsToday)}</dd>
            </div>
            <div>
              <dt>{t("diversity")}</dt>
              <dd>{format.number(progress.diversity, { style: "percent" })}</dd>
            </div>
          </dl>
        </div>
        <p className="streak" data-active={progress.currentStreak > 0 || undefined}>
          <span aria-hidden="true">🔥</span>{" "}
          {progress.currentStreak > 0
            ? t("streak", { count: progress.currentStreak })
            : t("streakNone")}
          {progress.longestStreak > 0 ? (
            <span className="streak__best">
              {" "}
              · {t("streakBest", { count: progress.longestStreak })}
            </span>
          ) : null}
        </p>
      </header>

      <section aria-labelledby="goals" className="you__section">
        <h2 id="goals" className="section-title">
          {t("goals.title")}
        </h2>
        <ul className="goals">
          {progress.goals.map((goal) => (
            <li key={goal.key} className="goal" data-done={goal.done || undefined}>
              <span className="goal__period">{t(`goals.${goal.period}`)}</span>
              <span className="goal__name">
                {t(`goals.names.${goal.key}`, { target: goal.target })}
              </span>
              <span className="goal__count">
                {n(Math.min(goal.value, goal.target))} / {n(goal.target)}
                {goal.done ? <span className="goal__done"> · {t("goals.done")}</span> : null}
              </span>
              <Meter
                value={goal.value}
                max={goal.target}
                label={t(`goals.names.${goal.key}`, { target: goal.target })}
              />
            </li>
          ))}
        </ul>
        <p className="field__hint">{t("goals.hint")}</p>
      </section>

      <section aria-labelledby="stats" className="you__section">
        <h2 id="stats" className="section-title">
          {t("stats.title")}
        </h2>
        <nav className="region-filter" aria-label={t("stats.period")}>
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={{ pathname: "/you", query: { period: p } }}
              className="region-filter__chip"
              aria-current={p === period ? "page" : undefined}
            >
              {t(`stats.periods.${p}`)}
            </Link>
          ))}
        </nav>
        <dl className="stat-grid">
          {tiles.map(([key, value]) => (
            <div key={key} className="stat-tile">
              <dt>{t(`stats.labels.${key}`)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="field__hint">{t("stats.hint")}</p>
      </section>

      <section aria-labelledby="recap" className="you__section recap">
        <h2 id="recap" className="section-title">
          {t("recap.title")}
        </h2>
        {recapEmpty ? (
          <p className="field__hint">{t("recap.empty")}</p>
        ) : (
          <>
            <ViewEvent name="weekly_recap_viewed" />
            <p className="recap__week">
              {t("recap.week", {
                date: format.dateTime(new Date(recap.week_start), {
                  day: "numeric",
                  month: "long",
                }),
              })}
            </p>
            <dl className="stat-grid stat-grid--recap">
              <div className="stat-tile">
                <dt>{t("stats.labels.listening")}</dt>
                <dd>{formatListening(Number(recap.listening_ms))}</dd>
              </div>
              <div className="stat-tile">
                <dt>{t("stats.labels.songs")}</dt>
                <dd>{n(recap.songs)}</dd>
              </div>
              <div className="stat-tile">
                <dt>{t("stats.labels.newArtists")}</dt>
                <dd>{n(recap.new_artists)}</dd>
              </div>
              <div className="stat-tile">
                <dt>{t("stats.labels.countries")}</dt>
                <dd>{n(recap.countries)}</dd>
              </div>
              <div className="stat-tile">
                <dt>{t("stats.labels.genres")}</dt>
                <dd>{n(recap.genres)}</dd>
              </div>
              <div className="stat-tile">
                <dt>{t("recap.streak")}</dt>
                <dd>{n(recap.streak)}</dd>
              </div>
            </dl>
            {recap.biggest_discovery ? (
              <p className="recap__line">
                {t("recap.biggest")}{" "}
                <Link
                  href={{
                    pathname: "/artists/[slug]",
                    params: { slug: recap.biggest_discovery.slug },
                  }}
                >
                  {recap.biggest_discovery.name}
                </Link>
              </p>
            ) : null}
            {recap.top_genre ? (
              <p className="recap__line">
                {t("recap.topGenre")}{" "}
                <strong>
                  {locale === "pl" ? recap.top_genre.name_pl : recap.top_genre.name_en}
                </strong>
              </p>
            ) : null}
            {recap.percentile !== null ? (
              <p className="recap__line">
                {t("recap.percentile", { percentile: recap.percentile })}
              </p>
            ) : null}
            <p className="recap__share">
              <a
                className="button button--primary"
                href={`/api/cards/week?format=story&locale=${locale}`}
                target="_blank"
                rel="noopener"
              >
                {t("recap.shareStory")}
              </a>
              <a
                className="button"
                href={`/api/cards/week?format=square&locale=${locale}`}
                target="_blank"
                rel="noopener"
              >
                {t("recap.shareSquare")}
              </a>
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="records" className="you__section">
        <h2 id="records" className="section-title">
          {t("records.title")}
        </h2>
        <ul className="records">
          <li>
            <span>🏆 {t("records.mostSongsDay")}</span>
            <strong>{records.most_songs_day ? n(records.most_songs_day.value) : "—"}</strong>
          </li>
          <li>
            <span>🏆 {t("records.mostArtistsWeek")}</span>
            <strong>{records.most_artists_week ? n(records.most_artists_week.value) : "—"}</strong>
          </li>
          <li>
            <span>🏆 {t("records.longestStreak")}</span>
            <strong>
              {records.longest_streak ? t("records.days", { count: records.longest_streak }) : "—"}
            </strong>
          </li>
          <li>
            <span>🏆 {t("records.countries")}</span>
            <strong>{n(records.countries)}</strong>
          </li>
          <li>
            <span>🏆 {t("records.longestSession")}</span>
            <strong>
              {records.longest_session
                ? formatListening(Number(records.longest_session.value))
                : "—"}
            </strong>
          </li>
        </ul>
      </section>

      <section aria-labelledby="achievements" className="you__section">
        <h2 id="achievements" className="section-title">
          {t("achievements.title", { unlocked, total: achievements.length })}
        </h2>
        <ul className="achievements">
          {achievements.map((a) => (
            <li
              key={a.code}
              className="achievement"
              data-unlocked={a.unlockedAt ? true : undefined}
            >
              <span className="achievement__name">
                {t(`achievements.names.${a.code as "first_discovery"}`)}
              </span>
              <span className="achievement__text">
                {t(`achievements.metrics.${a.metric as "songs"}`, { count: a.threshold })}
              </span>
              <span className="achievement__state">
                {a.unlockedAt
                  ? t("achievements.unlocked", {
                      date: format.dateTime(new Date(a.unlockedAt), { dateStyle: "medium" }),
                    })
                  : t("achievements.locked")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {following.length ? (
        <section aria-labelledby="following" className="you__section">
          <h2 id="following" className="section-title">
            {t("following")}
          </h2>
          <ul className="artist-list">
            {following.map((person) => (
              <li key={person.id} className="artist-list__item">
                <Link
                  className="artist-list__name"
                  href={{ pathname: "/profile/[handle]", params: { handle: person.handle } }}
                >
                  {person.name}
                </Link>
                <Link
                  href={{ pathname: "/you/compare/[handle]", params: { handle: person.handle } }}
                >
                  {t("compareWith")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="you__links" aria-label={t("more")}>
        <Link href="/rankings" className="button">
          {t("rankings")}
        </Link>
        <Link href="/welcome" className="button">
          {t("preferences")}
        </Link>
        <Link href="/library" className="button">
          {t("saved")}
        </Link>
      </nav>

      <PointRules />
    </section>
  );
}

/** How points work — the real values from the database rules. */
async function PointRules() {
  const t = await getTranslations("You.rules");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("discovery_point_rules")
    .select("kind, points, enabled")
    .order("points");
  return (
    <section aria-labelledby="rules" className="you__section">
      <h2 id="rules" className="section-title">
        {t("title")}
      </h2>
      <ul className="point-rules">
        {(data ?? [])
          .filter((rule) => rule.enabled)
          .map((rule) => (
            <li key={rule.kind}>
              <span>{t(`kinds.${rule.kind as "new_song"}`)}</span>
              <strong>+{rule.points}</strong>
            </li>
          ))}
      </ul>
      <p className="field__hint">{t("fair")}</p>
    </section>
  );
}
