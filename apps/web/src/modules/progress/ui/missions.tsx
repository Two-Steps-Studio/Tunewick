import { getFormatter, getTranslations } from "next-intl/server";
import type { Mission, MissionCadence } from "../queries";

const ORDER: MissionCadence[] = ["daily", "weekly", "monthly", "event"];

/**
 * Missions grouped by cadence: what to do, progress, the XP it pays and when it ends. Names come
 * from the metric and target, so a new mission is only a row in discovery_challenges.
 */
export async function MissionList({
  missions,
  cadences = ORDER,
}: {
  missions: Mission[];
  cadences?: MissionCadence[];
}) {
  const t = await getTranslations("Missions");
  const format = await getFormatter();
  const groups = cadences
    .map((cadence) => ({ cadence, items: missions.filter((m) => m.cadence === cadence) }))
    .filter((group) => group.items.length);
  if (!groups.length) return <p className="field__hint">{t("empty")}</p>;
  return (
    <div className="missions">
      {groups.map((group) => (
        <div key={group.cadence} className="missions__group">
          <p className="missions__cadence">
            {t(`cadence.${group.cadence}`)}
            <span>
              {t("ends", {
                date: format.dateTime(new Date(group.items[0]!.endsAt), {
                  dateStyle: "medium",
                  timeStyle: group.cadence === "daily" ? "short" : undefined,
                }),
              })}
            </span>
          </p>
          <ul className="missions__list">
            {group.items.map((m) => {
              const name = t(`metrics.${m.metric as "new_songs"}`, { target: m.target });
              return (
                <li key={m.code} className="mission" data-done={m.completedAt ? true : undefined}>
                  <span className="mission__xp">{t("xp", { xp: m.xp })}</span>
                  <span className="mission__name">{name}</span>
                  <span className="mission__count">
                    {m.completedAt
                      ? t("done")
                      : t("progress", { progress: m.progress, target: m.target })}
                  </span>
                  <span
                    className="mission__meter"
                    role="progressbar"
                    aria-label={name}
                    aria-valuemin={0}
                    aria-valuemax={m.target}
                    aria-valuenow={m.progress}
                  >
                    <span
                      style={{
                        transform: `scaleX(${m.target ? Math.min(1, m.progress / m.target) : 0})`,
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
