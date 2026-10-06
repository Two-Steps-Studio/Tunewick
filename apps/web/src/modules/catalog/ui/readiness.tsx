import { getFormatter, getTranslations } from "next-intl/server";

interface Declaration {
  owns_master: boolean;
  controls_composition: boolean;
  cmo_memberships: string[];
  samples: string;
  ai_content: string;
  terms_version: string;
  declared_at: string;
}

/** Read-only summary of the current declaration. */
export async function DeclarationSummary({ declaration }: { declaration: Declaration }) {
  const t = await getTranslations("Releases");
  const format = await getFormatter();
  const yesNo = (value: boolean) => (value ? t("rights.summary.yes") : t("rights.summary.no"));
  return (
    <div className="declaration">
      <p className="declaration__title">{t("rights.current")}</p>
      <dl className="declaration__list">
        <dt>{t("rights.summary.master")}</dt>
        <dd>{yesNo(declaration.owns_master)}</dd>
        <dt>{t("rights.summary.composition")}</dt>
        <dd>{yesNo(declaration.controls_composition)}</dd>
        <dt>{t("rights.summary.cmo")}</dt>
        <dd>
          {declaration.cmo_memberships
            .map((c) => t(`rights.cmo.${c}` as Parameters<typeof t>[0]))
            .join(", ")}
        </dd>
        <dt>{t("rights.summary.samples")}</dt>
        <dd>{t(`rights.samples.${declaration.samples}` as Parameters<typeof t>[0])}</dd>
        <dt>{t("rights.summary.ai")}</dt>
        <dd>{t(`ai.${declaration.ai_content}` as Parameters<typeof t>[0])}</dd>
      </dl>
      <p className="field__hint">
        {t("rights.declaredAt", {
          date: format.dateTime(new Date(declaration.declared_at), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })}{" "}
        · {declaration.terms_version}
      </p>
    </div>
  );
}

/** What is still missing before a release can be submitted. */
export async function ReadinessChecklist({
  hasTracks,
  aiDeclared,
  rightsDeclared,
  audio,
}: {
  hasTracks: boolean;
  aiDeclared: boolean;
  rightsDeclared: boolean;
  /** Every track has an accepted master / some are waiting for the worker / something missing. */
  audio: "ready" | "processing" | "missing";
}) {
  const t = await getTranslations("Releases.readiness");
  const items = [
    { done: hasTracks, label: t("tracks") },
    { done: aiDeclared, label: t("ai") },
    { done: rightsDeclared, label: t("rights") },
    {
      done: audio === "ready",
      label:
        audio === "ready"
          ? t("audio")
          : audio === "processing"
            ? t("audioProcessing")
            : t("audioMissing"),
    },
  ];
  return (
    <section className="settings-form__group" aria-labelledby="readiness">
      <h2 id="readiness" className="section-title">
        {t("title")}
      </h2>
      <ul className="readiness">
        {items.map((item) => (
          <li key={item.label} className={item.done ? "readiness__done" : "readiness__todo"}>
            <span className="visually-hidden">{item.done ? "✓ " : "✗ "}</span>
            {item.label}
          </li>
        ))}
      </ul>
      <p className="field__hint">{t("note")}</p>
    </section>
  );
}
