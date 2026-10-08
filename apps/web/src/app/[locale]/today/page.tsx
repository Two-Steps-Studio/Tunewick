import { JOURNEYS, WEEKLY_SECTIONS } from "@tunewick/shared";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { getDiscoverySets, type DiscoverySetView } from "@/modules/discover";
import { getMyMissions, MissionList } from "@/modules/progress";
import { Artwork } from "@/modules/images";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/today">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Today" });
  return { title: t("title") };
}

/**
 * Today: "what will I discover today?" — the listener's Daily Discovery (ten new songs, done at
 * five discoveries), this week's Weekly Drop in five parts, and Surprise Me journeys.
 */
export default async function TodayPage({ params }: PageProps<"/[locale]/today">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Today");
  const format = await getFormatter();
  const [sets, missions] = await Promise.all([getDiscoverySets(), getMyMissions()]);
  const daily = sets?.find((s) => s.kind === "daily") ?? null;
  const weekly = sets?.find((s) => s.kind === "weekly") ?? null;

  return (
    <section className="today">
      <header className="today__head">
        <p className="today__date">
          {format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="today__title">{t("title")}</h1>
        <p className="today__lead">{t("lead")}</p>
      </header>

      {sets === null ? (
        <div className="today__signin">
          <p>{t("signedOut")}</p>
          <Link href="/login" className="button button--primary">
            {t("signIn")}
          </Link>
        </div>
      ) : null}

      {daily ? (
        <SetCard
          set={daily}
          locale={locale}
          t={t}
          href={{ pathname: "/", query: { set: "daily" } }}
        />
      ) : sets ? (
        <p className="today__empty" role="status">
          {t("noDaily")}
        </p>
      ) : null}

      {sets !== null ? (
        <section aria-labelledby="today-missions" className="today__section">
          <h2 id="today-missions" className="today__heading">
            {t("missions")}
          </h2>
          <MissionList missions={missions} cadences={["daily", "event"]} />
          <Link href="/you" className="today__all">
            {t("allMissions")}
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="journeys" className="today__section">
        <h2 id="journeys" className="today__heading">
          {t("surprise.title")}
        </h2>
        <p className="today__hint">{t("surprise.lead")}</p>
        <ul className="journeys">
          {JOURNEYS.map((journey) => (
            <li key={journey}>
              <Link
                href={{ pathname: "/", query: { journey } }}
                className="journey"
                data-journey={journey}
              >
                <span className="journey__name">{t(`journeys.${journey}.name`)}</span>
                <span className="journey__text">{t(`journeys.${journey}.text`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {weekly ? (
        <SetCard
          set={weekly}
          locale={locale}
          t={t}
          href={{ pathname: "/", query: { set: "weekly" } }}
        />
      ) : null}

      <nav className="today__more" aria-label={t("moreLabel")}>
        <Link href={{ pathname: "/charts", query: { c: "rising" } }}>{t("more.rising")}</Link>
        <Link href={{ pathname: "/charts", query: { c: "underground" } }}>
          {t("more.underground")}
        </Link>
        <Link href={{ pathname: "/charts", query: { c: "world" } }}>{t("more.world")}</Link>
        <Link href={{ pathname: "/charts", query: { c: "fresh", h: "24" } }}>
          {t("more.fresh")}
        </Link>
      </nav>
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"Today">>>;

function SetCard({
  set,
  locale,
  t,
  href,
}: {
  set: DiscoverySetView;
  locale: string;
  t: T;
  href: { pathname: "/"; query: { set: string } };
}) {
  const sections =
    set.kind === "weekly"
      ? WEEKLY_SECTIONS.map((section) => ({
          section,
          tracks: set.tracks.filter((track) => track.section === section),
        })).filter((group) => group.tracks.length)
      : [{ section: "daily", tracks: set.tracks }];
  const id = `set-${set.kind}`;
  return (
    <section
      aria-labelledby={id}
      className="set-card"
      data-kind={set.kind}
      data-done={set.completed || undefined}
    >
      <header className="set-card__head">
        <p className="set-card__kicker">{t(`${set.kind}.kicker`)}</p>
        <h2 id={id} className="set-card__title">
          {t(`${set.kind}.title`)}
        </h2>
        <p className="set-card__lead">{t(`${set.kind}.lead`, { target: set.target })}</p>
        <div
          className="set-card__meter"
          role="progressbar"
          aria-label={t("progressLabel")}
          aria-valuemin={0}
          aria-valuemax={set.target}
          aria-valuenow={Math.min(set.progress, set.target)}
        >
          <span
            style={{
              transform: `scaleX(${set.target ? Math.min(1, set.progress / set.target) : 0})`,
            }}
          />
        </div>
        <p className="set-card__status">
          {set.completed
            ? t("completed", { xp: set.kind === "daily" ? 100 : 250 })
            : t("progress", {
                progress: Math.min(set.progress, set.target),
                target: set.target,
                xp: set.kind === "daily" ? 100 : 250,
              })}
        </p>
        <Link href={href} className="button button--primary set-card__start">
          {set.progress > 0 ? t("continue") : t("start")}
        </Link>
      </header>
      {sections.map((group) => (
        <div key={group.section} className="set-card__group">
          {set.kind === "weekly" ? (
            <h3 className="set-card__section">{t(`sections.${group.section as "new"}`)}</h3>
          ) : null}
          <ol className="set-list">
            {group.tracks.map((track) => (
              <li
                key={track.trackId}
                className="set-list__item"
                data-heard={track.heard || undefined}
              >
                <Artwork image={track.cover} alt="" sizes="3rem" className="set-list__art" />
                <span className="set-list__main">
                  <Link
                    href={{
                      pathname: "/song/[artist]/[song]",
                      params: {
                        artist: track.artist.slug,
                        song: songSegment(track.title, track.code, slugify),
                      },
                    }}
                    className="set-list__title"
                  >
                    {track.title}
                  </Link>
                  <span className="set-list__artist">
                    {track.artist.name}
                    {track.countryCode ? (
                      <span aria-label={countryName(track.countryCode, locale)}>
                        {" "}
                        {flagEmoji(track.countryCode)}
                      </span>
                    ) : null}
                  </span>
                </span>
                {track.heard ? (
                  <span className="set-list__check" aria-label={t("heard")}>
                    ✓
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
