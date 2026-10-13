import { discoveryScore, levelFor } from "@tunewick/shared";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatListening } from "@/lib/intl";
import { getCommonGround, getProfileOverview } from "../queries";

/**
 * A profile's discovery side: level and Discovery Score, badges, the last 30 days and - for a
 * signed-in visitor - what you have in common. Every part appears only if its owner allows it.
 */
export async function ProfileDiscovery({
  handle,
  name,
  viewerSignedIn,
  own,
}: {
  handle: string;
  name: string;
  viewerSignedIn: boolean;
  own: boolean;
}) {
  const [overview, common, t, tYou, tBadges, format, locale] = await Promise.all([
    getProfileOverview(handle),
    viewerSignedIn && !own ? getCommonGround(handle) : Promise.resolve(null),
    getTranslations("ProfileDiscovery"),
    getTranslations("You"),
    getTranslations("You.achievements.names"),
    getFormatter(),
    getLocale(),
  ]);
  if (!overview) return null;
  const n = (value: number) => format.number(Number(value));
  const nothing =
    !overview.score && !overview.badges && !overview.stats && !overview.replay && !common;

  return (
    <section aria-labelledby="profile-discovery" className="profile-discovery">
      <h2 id="profile-discovery" className="section-title">
        {t("title")}
      </h2>
      {nothing ? <p className="field__hint">{t("hidden", { name })}</p> : null}

      {overview.score
        ? (() => {
            const level = levelFor(Number(overview.score.xp));
            return (
              <dl className="stat-grid">
                <div className="stat-tile">
                  <dt>{t("score")}</dt>
                  <dd>
                    {n(
                      discoveryScore(
                        Number(overview.score.discovery_xp),
                        overview.score.genre_spread,
                      ),
                    )}
                  </dd>
                </div>
                <div className="stat-tile">
                  <dt>{t("level")}</dt>
                  <dd>{level.level}</dd>
                </div>
                <div className="stat-tile">
                  <dt>{t("title_")}</dt>
                  <dd className="stat-tile__text">{tYou(`levels.${level.title}`)}</dd>
                </div>
              </dl>
            );
          })()
        : null}

      {overview.stats ? (
        <>
          <h3 className="profile-discovery__sub">{t("last30")}</h3>
          <dl className="stat-grid">
            <div className="stat-tile">
              <dt>{t("listening")}</dt>
              <dd>{formatListening(Number(overview.stats.listening_ms))}</dd>
            </div>
            <div className="stat-tile">
              <dt>{t("newArtists")}</dt>
              <dd>{n(overview.stats.new_artists)}</dd>
            </div>
            <div className="stat-tile">
              <dt>{t("newSongs")}</dt>
              <dd>{n(overview.stats.new_songs)}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {overview.badges ? (
        <>
          <h3 className="profile-discovery__sub">
            {t("badges", { count: overview.badges.length })}
          </h3>
          {overview.badges.length ? (
            <ul className="profile-badges">
              {overview.badges.map((b) => (
                <li key={b.code}>
                  {tBadges.has(b.code as "first_discovery")
                    ? tBadges(b.code as "first_discovery")
                    : b.code}
                </li>
              ))}
            </ul>
          ) : (
            <p className="field__hint">{t("noBadges")}</p>
          )}
        </>
      ) : null}

      {overview.replay ? (
        <>
          <h3 className="profile-discovery__sub">{t("replay", { year: overview.replay.year })}</h3>
          <p className="profile-common">
            {t("replayLine", {
              minutes: n(overview.replay.minutes),
              artists: n(overview.replay.new_artists),
            })}
            {overview.replay.top_artist?.slug ? (
              <>
                {" "}
                {t("replayArtist")}{" "}
                <Link
                  href={{
                    pathname: "/artists/[slug]",
                    params: { slug: overview.replay.top_artist.slug },
                  }}
                >
                  {overview.replay.top_artist.name}
                </Link>
              </>
            ) : null}
          </p>
        </>
      ) : null}

      {common ? (
        <>
          <h3 className="profile-discovery__sub">
            {t("common", { percent: format.number(common.match, { style: "percent" }) })}
          </h3>
          {common.artists.length || common.genres.length ? (
            <p className="profile-common">
              {common.artists.slice(0, 8).map((a, i) => (
                <span key={a.slug}>
                  {i ? ", " : ""}
                  <Link href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}>
                    {a.name}
                  </Link>
                </span>
              ))}
              {common.genres.length ? (
                <span className="field__hint">
                  {" "}
                  ·{" "}
                  {common.genres
                    .slice(0, 5)
                    .map((g) => (locale === "pl" ? g.name_pl : g.name_en))
                    .join(", ")}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="field__hint">{t("noCommon")}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
