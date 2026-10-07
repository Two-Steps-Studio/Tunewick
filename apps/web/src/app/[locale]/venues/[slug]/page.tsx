import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { EventList, getVenue } from "@/modules/events";

type Params = PageProps<"/[locale]/venues/[slug]">["params"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await getVenue(decodeURIComponent((await params).slug));
  return data ? { title: `${data.venue.name}, ${data.venue.city}` } : {};
}

/** A venue's musical identity over time: what is coming and what has played there. */
export default async function VenuePage({ params }: PageProps<"/[locale]/venues/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const data = await getVenue(decodeURIComponent(slug));
  if (!data) notFound();
  const { venue, upcoming, past } = data;
  const t = await getTranslations("Venues");
  const tReports = await getTranslations("Reports");
  const tPlaces = await getTranslations("Places");

  return (
    <section className="discover">
      <header className="discover__head">
        <p className="artist-badge">{venue.verified ? t("verified") : t("unverified")}</p>
        <h1 className="discover__title">{venue.name}</h1>
        <p className="discover__lead">
          {[
            venue.address,
            venue.city,
            tPlaces("voivodeshipShort", { name: tPlaces(`voivodeship.${venue.voivodeship}`) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {venue.website ? (
          <p>
            <a href={venue.website} target="_blank" rel="noopener noreferrer nofollow">
              {t("website")}
            </a>
          </p>
        ) : null}
      </header>
      <section aria-labelledby="venue-upcoming" className="discover__section">
        <h2 id="venue-upcoming" className="section-title">
          {t("upcoming")}
        </h2>
        {upcoming.length ? (
          <EventList events={upcoming} />
        ) : (
          <p className="field__hint">{t("noUpcoming")}</p>
        )}
      </section>
      {past.length ? (
        <section aria-labelledby="venue-past" className="discover__section">
          <h2 id="venue-past" className="section-title">
            {t("past")}
          </h2>
          <EventList events={past} />
        </section>
      ) : null}
      <p className="report-link">
        <Link href={{ pathname: "/report", query: { typ: "venue", id: venue.id } }}>
          {tReports("link")}
        </Link>
      </p>
    </section>
  );
}
