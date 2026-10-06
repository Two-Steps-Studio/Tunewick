import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getSoundchecks, listenerEntitlement } from "@/modules/audio";
import { AttendedButton, getAttended, getEvent, getNewestReleases } from "@/modules/events";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import { SoundcheckButton } from "@/modules/player";

type Params = PageProps<"/[locale]/events/[id]">["params"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await getEvent((await params).id);
  return data ? { title: `${data.event.title} — ${data.event.venue.name}` } : {};
}

/** An event is playable: every artist in the lineup with a soundcheck of their newest release. */
export default async function EventPage({ params }: PageProps<"/[locale]/events/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const data = await getEvent(id);
  if (!data) notFound();
  const { event, lineup } = data;
  const t = await getTranslations("Events");
  const tPlaces = await getTranslations("Places");
  const format = await getFormatter();

  const entitlement = await listenerEntitlement();
  const newest = await getNewestReleases(lineup.map((a) => a.id));
  const soundchecks = await getSoundchecks(
    lineup.flatMap((a) =>
      newest.get(a.id) ? [{ id: newest.get(a.id)!, artistName: a.name }] : [],
    ),
    entitlement,
  );
  const images = await getImageSourcesMany(
    lineup.map((a) => a.image_id),
    320,
  );
  const starts = new Date(event.starts_at);
  const attended = event.status === "published" ? await getAttended(event.id) : null;
  // "Byłem przy tym" opens when the gig starts and closes 30 days later (the database checks).
  const now = new Date();
  const window =
    now.getTime() < starts.getTime()
      ? "before"
      : now.getTime() > starts.getTime() + 30 * 24 * 3600_000
        ? "closed"
        : "open";

  return (
    <article className="discover">
      <header className="discover__head">
        <p className="artist-badge">
          {event.status === "cancelled"
            ? t("cancelled")
            : event.status === "published"
              ? t("badge")
              : t(`status.${event.status}`)}
        </p>
        <h1 className="discover__title">{event.title}</h1>
        <p className="discover__lead">
          <time dateTime={event.starts_at}>
            {format.dateTime(starts, {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Europe/Warsaw",
            })}
          </time>
        </p>
        <p>
          <Link href={{ pathname: "/venues/[slug]", params: { slug: event.venue.slug } }}>
            {event.venue.name}
          </Link>
          {` · ${event.venue.city}, ${tPlaces("voivodeshipShort", {
            name: tPlaces(`voivodeship.${event.venue.voivodeship}`),
          })}`}
          {event.venue.address ? ` · ${event.venue.address}` : ""}
        </p>
        {event.status === "rejected" && event.review_note ? (
          <p className="form-status">{t("rejected", { reason: event.review_note })}</p>
        ) : null}
        {event.ticket_url && event.status === "published" ? (
          <p>
            <a
              className="button button--primary"
              href={event.ticket_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {t("tickets")}
            </a>
          </p>
        ) : null}
        {event.description ? <p className="profile__bio">{event.description}</p> : null}
        {attended !== null && (window === "open" || attended) ? (
          <AttendedButton eventId={event.id} initial={attended} />
        ) : attended !== null && window === "before" ? (
          <p className="field__hint">{t("attended.later")}</p>
        ) : null}
      </header>

      <section aria-labelledby="lineup" className="discover__section">
        <h2 id="lineup" className="section-title">
          {t("lineup")}
        </h2>
        <ul className="artist-grid">
          {lineup.map((a) => {
            const releaseId = newest.get(a.id);
            const soundcheck = releaseId ? soundchecks.get(releaseId) : undefined;
            return (
              <li key={a.id} className="artist-card">
                <Link
                  href={{ pathname: "/artists/[slug]", params: { slug: a.slug } }}
                  className="artist-card__link"
                >
                  <Artwork
                    image={a.image_id ? (images.get(a.image_id) ?? null) : null}
                    alt=""
                    sizes="8rem"
                    className="artwork--round"
                  />
                  <span className="artist-card__name">{a.name}</span>
                </Link>
                {soundcheck ? (
                  <SoundcheckButton
                    {...soundcheck}
                    entitlement={entitlement}
                    label={t("soundcheckLabel", { artist: a.name, title: soundcheck.track.title })}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                    </svg>
                    {t("soundcheck")}
                  </SoundcheckButton>
                ) : (
                  <span className="release-card__place">{t("noMusic")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
