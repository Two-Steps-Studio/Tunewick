import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export interface EventListItem {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  venue?: { name: string; city: string } | null;
  lineup?: { slug: string; name: string }[];
}

/** Events as a dated list — the date first, then what and where. Cancelled ones say so. */
export async function EventList({ events }: { events: EventListItem[] }) {
  const t = await getTranslations("Events");
  const format = await getFormatter();
  return (
    <ol className="event-list">
      {events.map((e) => {
        const date = new Date(e.starts_at);
        return (
          <li key={e.id} className="event-list__item">
            <time dateTime={e.starts_at} className="event-list__date">
              <span className="event-list__day">
                {format.dateTime(date, { day: "numeric", timeZone: "Europe/Warsaw" })}
              </span>
              <span className="event-list__month">
                {format.dateTime(date, { month: "short", timeZone: "Europe/Warsaw" })}
              </span>
            </time>
            <span className="event-list__body">
              <Link
                href={{ pathname: "/events/[id]", params: { id: e.id } }}
                className="event-list__title"
              >
                {e.title}
              </Link>
              <span className="event-list__meta">
                {[
                  format.dateTime(date, {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Warsaw",
                  }),
                  e.venue ? `${e.venue.name}, ${e.venue.city}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {e.lineup?.length ? (
                <span className="event-list__lineup">{e.lineup.map((a) => a.name).join(", ")}</span>
              ) : null}
              {e.status === "cancelled" ? (
                <span className="event-list__cancelled">{t("cancelled")}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
