import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProfileActivity } from "../queries";

/**
 * A person's activity: gigs marked "Byłem przy tym" and public playlists. The database decides
 * visibility; when hidden, the page says so instead of pretending there is nothing.
 */
export async function ProfileActivity({
  profileId,
  visible,
  own,
}: {
  profileId: string;
  visible: boolean;
  own: boolean;
}) {
  const t = await getTranslations("Social");
  const format = await getFormatter();
  if (!visible) {
    return (
      <section className="profile-activity" aria-labelledby="activity">
        <h2 id="activity" className="section-title">
          {t("activityTitle")}
        </h2>
        <p className="field__hint">{t("activityHidden")}</p>
      </section>
    );
  }
  const { events, playlists } = await getProfileActivity(profileId);
  return (
    <section className="profile-activity" aria-labelledby="activity">
      <h2 id="activity" className="section-title">
        {t("activityTitle")}
      </h2>
      {own ? <p className="field__hint">{t("activityOwn")}</p> : null}
      <h3 className="profile-activity__title">{t("attended")}</h3>
      {events.length ? (
        <ul className="profile-activity__list">
          {events.map((e) => (
            <li key={e.event_id}>
              <Link href={{ pathname: "/events/[id]", params: { id: e.event_id } }}>{e.title}</Link>
              <span className="profile-activity__meta">
                {format.dateTime(new Date(e.starts_at), {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "Europe/Warsaw",
                })}{" "}
                · {e.venue_name}, {e.venue_city}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field__hint">{t("attendedEmpty")}</p>
      )}
      <h3 className="profile-activity__title">{t("playlists")}</h3>
      {playlists.length ? (
        <ul className="profile-activity__list">
          {playlists.map((p) => (
            <li key={p.id}>
              <Link href={{ pathname: "/playlists/[id]", params: { id: p.id } }}>{p.title}</Link>
              <span className="profile-activity__meta">
                {t("trackCount", { count: p.track_count })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field__hint">{t("playlistsEmpty")}</p>
      )}
    </section>
  );
}
