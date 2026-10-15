import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Artwork, getImageSources } from "@/modules/images";
import { getMyReminder } from "../queries";
import type { UpcomingRelease } from "../queries";
import { Countdown } from "./countdown";
import { ReminderButton } from "./reminder-button";

/**
 * The page of a release before its date: cover, title, artist, when it comes out, a countdown
 * and "Remind me". No tracks, no audio - those appear at the premiere.
 */
export async function PremierePage({
  release,
  next,
}: {
  release: UpcomingRelease;
  /** Where sign-in returns to (this page). */
  next: string;
}) {
  const [t, tReleases, format, cover, reminded] = await Promise.all([
    getTranslations("Premiere"),
    getTranslations("Releases"),
    getFormatter(),
    getImageSources(release.artworkImageId, 1280),
    getMyReminder(release.id),
  ]);
  return (
    <article className="premiere">
      <div className="premiere__art">
        <Artwork
          image={cover}
          alt={t("cover", { title: release.title })}
          sizes="(min-width: 768px) 24rem, 90vw"
        />
      </div>
      <div className="premiere__body">
        <p className="premiere__kicker">{t("kicker")}</p>
        <h1 className="release-page__title">{release.title}</h1>
        <p className="premiere__artist">
          <Link href={{ pathname: "/artists/[slug]", params: { slug: release.artist.slug } }}>
            {release.artist.name}
          </Link>{" "}
          · {tReleases(`types.${release.type}`)}
        </p>
        <p className="premiere__date">
          {t("outOn", {
            // Releases go live at midnight in Poland (review_release): the day there.
            date: format.dateTime(new Date(release.publishAt), {
              dateStyle: "full",
              timeZone: "Europe/Warsaw",
            }),
          })}
        </p>
        <Countdown at={release.publishAt} />
        {reminded === null ? (
          <p>
            <Link className="button button--primary" href={{ pathname: "/login", query: { next } }}>
              {t("signInToRemind")}
            </Link>
          </p>
        ) : (
          <ReminderButton releaseId={release.id} initial={reminded} />
        )}
        {release.reminders > 0 ? (
          <p className="field__hint">{t("waiting", { count: release.reminders })}</p>
        ) : null}
      </div>
    </article>
  );
}
