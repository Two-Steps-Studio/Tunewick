import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji } from "@/lib/intl";
import { getOptionalUser } from "@/modules/auth";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import { getFriendsActivity, getFriendsLeaderboard, type FriendsPeriod } from "@/modules/social";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/you/friends">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Friends" });
  return { title: t("title") };
}

const PERIODS: FriendsPeriod[] = ["week", "month", "all"];

/** Friends: who of the people you follow discovers the most, and what they found lately. */
export default async function FriendsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/you/friends">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Friends");
  const tBadges = await getTranslations("You.achievements.names");
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
  const period = PERIODS.includes(query.period as FriendsPeriod)
    ? (query.period as FriendsPeriod)
    : "week";
  const [board, activity, format] = await Promise.all([
    getFriendsLeaderboard(period),
    getFriendsActivity(),
    getFormatter(),
  ]);
  const images = await getImageSourcesMany(
    activity.map((a) => a.artist_image_id),
    120,
  );
  const alone = board.length <= 1;

  return (
    <section className="stats friends">
      <header className="stats__head">
        <p className="stats__back">
          <Link href="/you">{t("back")}</Link>
        </p>
        <h1 className="stats__title">{t("title")}</h1>
        <p className="stats__lead">{t("lead")}</p>
      </header>

      <section aria-labelledby="friends-ranking" className="stats__section">
        <h2 id="friends-ranking" className="section-title">
          {t("ranking.title")}
        </h2>
        <nav className="region-filter" aria-label={t("ranking.period")}>
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={{ pathname: "/you/friends", query: p === "week" ? {} : { period: p } }}
              className="region-filter__chip"
              aria-current={p === period ? "page" : undefined}
            >
              {t(`ranking.periods.${p}`)}
            </Link>
          ))}
        </nav>
        {alone ? (
          <div className="empty-state">
            <p>{t("ranking.empty")}</p>
            <Link href="/search" className="button">
              {t("findPeople")}
            </Link>
          </div>
        ) : (
          <ol className="friends-board">
            {board.map((row) => (
              <li key={row.handle} className={row.is_me ? "is-me" : undefined}>
                <span className="friends-board__rank">{row.rank}</span>
                <Link href={{ pathname: "/profile/[handle]", params: { handle: row.handle } }}>
                  {row.is_me ? t("ranking.you") : (row.display_name ?? `@${row.handle}`)}
                </Link>
                <span className="friends-board__points">
                  {t("ranking.xp", { xp: format.number(row.points) })}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="field__hint">{t("ranking.hint")}</p>
      </section>

      <section aria-labelledby="friends-activity" className="stats__section">
        <h2 id="friends-activity" className="section-title">
          {t("activity.title")}
        </h2>
        {activity.length === 0 ? (
          <p className="field__hint">{t("activity.empty")}</p>
        ) : (
          <ul className="friends-feed">
            {activity.map((item, i) => {
              const who = (
                <Link href={{ pathname: "/profile/[handle]", params: { handle: item.handle } }}>
                  {item.display_name ?? `@${item.handle}`}
                </Link>
              );
              const when = format.relativeTime(new Date(item.at));
              return (
                <li key={`${item.handle}-${item.at}-${i}`}>
                  {item.kind === "new_artist" && item.artist_slug ? (
                    <>
                      <Artwork
                        image={
                          item.artist_image_id ? (images.get(item.artist_image_id) ?? null) : null
                        }
                        alt=""
                        sizes="48px"
                        className="stats-list__art stats-list__art--round"
                      />
                      <p>
                        {t.rich("activity.newArtist", {
                          who: () => who,
                          artist: () => (
                            <Link
                              href={{
                                pathname: "/artists/[slug]",
                                params: { slug: item.artist_slug! },
                              }}
                            >
                              {item.artist_name}
                            </Link>
                          ),
                        })}
                        {item.country_code
                          ? ` ${flagEmoji(item.country_code)} ${countryName(item.country_code, locale)}`
                          : ""}
                        <small>{when}</small>
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="friends-feed__badge" aria-hidden="true" />
                      <p>
                        {t.rich("activity.badge", {
                          who: () => who,
                          badge:
                            item.badge && tBadges.has(item.badge as "first_discovery")
                              ? tBadges(item.badge as "first_discovery")
                              : (item.badge ?? ""),
                        })}
                        <small>{when}</small>
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="field__hint">
        <Link href="/settings">{t("privacy")}</Link>
      </p>
    </section>
  );
}
