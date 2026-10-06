import { getFormatter, getTranslations } from "next-intl/server";
import { getDecisions } from "../queries";
import { AppealForm } from "./forms";

/** Moderation decisions about the owner's content, with the statement of reasons and appeals. */
export async function DecisionList({
  filter,
  canAppeal,
}: {
  filter: { artistId: string } | { playlistId: string };
  canAppeal: boolean;
}) {
  const decisions = await getDecisions(filter);
  if (!decisions.length) return null;
  const t = await getTranslations("Reports.decisions");
  const tModeration = await getTranslations("Reports.moderation");
  const format = await getFormatter();

  return (
    <section className="settings-form__group" aria-labelledby="moderation-decisions">
      <h2 id="moderation-decisions" className="section-title">
        {t("title")}
      </h2>
      <ul className="promo-codes">
        {decisions.map((d) => (
          <li key={d.id} className="promo-codes__item">
            <strong>{tModeration(`actions.${d.action as "takedown_release"}`)}</strong>
            <span className="field__hint">
              {format.dateTime(new Date(d.decided_at), { dateStyle: "long" })} ·{" "}
              {t(`appealStatus.${d.appeal_status as "none"}`)}
            </span>
            <p>{d.statement}</p>
            {d.appeal_note ? (
              <p className="form-status">{t("appealDecided", { note: d.appeal_note })}</p>
            ) : null}
            {canAppeal && d.appeal_status === "none" ? <AppealForm decisionId={d.id} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
