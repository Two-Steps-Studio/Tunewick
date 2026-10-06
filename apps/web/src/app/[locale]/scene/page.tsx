import { VOIVODESHIPS } from "@tunewick/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { parseRegion } from "@/modules/discover";
import { EventList, getUpcomingEvents } from "@/modules/events";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/scene">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Scene" });
  return { title: t("title") };
}

/** Scene: real, moderated gigs of independent artists, soonest first, by voivodeship. */
export default async function ScenePage({ params, searchParams }: PageProps<"/[locale]/scene">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Scene");
  const tPlaces = await getTranslations("Places");
  const region = parseRegion((await searchParams).woj);
  const events = await getUpcomingEvents(region, 60);

  return (
    <section className="discover">
      <header className="discover__head">
        <h1 className="discover__title">{t("title")}</h1>
        <p className="discover__lead">{t("leadEvents")}</p>
      </header>
      <nav aria-label={t("regionLabel")} className="region-filter">
        <Link
          href="/scene"
          className="region-filter__chip"
          aria-current={region === null ? "page" : undefined}
        >
          {t("allPoland")}
        </Link>
        {VOIVODESHIPS.map((v) => (
          <Link
            key={v}
            href={{ pathname: "/scene", query: { woj: v } }}
            className="region-filter__chip"
            aria-current={region === v ? "page" : undefined}
          >
            {tPlaces(`voivodeship.${v}`)}
          </Link>
        ))}
      </nav>
      {events.length === 0 ? (
        <p className="discover__empty" role="status">
          {region ? t("emptyRegion", { region: tPlaces(`voivodeship.${region}`) }) : t("empty")}
        </p>
      ) : (
        <section aria-labelledby="upcoming" className="discover__section">
          <h2 id="upcoming" className="section-title">
            {t("upcoming")}
          </h2>
          <EventList
            events={events.map((e) => ({
              id: e.event_id,
              title: e.title,
              starts_at: e.starts_at,
              status: e.status,
              venue: { name: e.venue_name, city: e.city },
              lineup: e.lineup,
            }))}
          />
        </section>
      )}
    </section>
  );
}
