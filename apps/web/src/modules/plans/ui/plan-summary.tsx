import { getFormatter, getTranslations } from "next-intl/server";
import { getMyPlan } from "../queries";
import { RedeemForm } from "./redeem-form";

/** Settings section: the plan as the database knows it — never more than that. */
export async function PlanSummary() {
  const t = await getTranslations("Plan");
  const format = await getFormatter();
  const plan = await getMyPlan();
  const premium = plan.code !== "free";

  const status = !premium
    ? t("free")
    : plan.endsAt
      ? t("until", {
          plan: plan.name,
          date: format.dateTime(new Date(plan.endsAt), {
            dateStyle: "long",
            timeZone: "Europe/Warsaw",
          }),
        })
      : t("lifetime", { plan: plan.name });

  return (
    <section className="settings-form__group" aria-labelledby="my-plan">
      <h2 id="my-plan" className="section-title">
        {t("title")}
      </h2>
      <div className="plan-status">
        <p className={premium ? "plan-status__premium" : "plan-status__free"}>{status}</p>
        {premium && plan.source ? (
          <p className="field__hint">{t(`source.${plan.source}`, { ref: plan.sourceRef ?? "" })}</p>
        ) : null}
        <p className="field__hint">{premium ? t("premiumQuality") : t("freeQuality")}</p>
      </div>
      {plan.endsAt !== null || !premium ? <RedeemForm /> : null}
    </section>
  );
}
