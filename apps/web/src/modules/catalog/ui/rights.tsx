"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useActionState, useState } from "react";
import {
  CheckboxField,
  FormMessage,
  SelectField,
  Submit,
  TextareaField,
} from "@/components/form/field";
import { declareRights } from "../actions";
import { ARTIST_TERMS_VERSION, CMO_OPTIONS, type ReleaseFormState } from "../validation";

const initial: ReleaseFormState = {};

/** Rights declaration form (docs/licensing.md §3). Wording is a draft pending legal review. */
export function RightsForm({
  releaseId,
  defaultAi,
  territoryLabel,
}: {
  releaseId: string;
  defaultAi: string;
  territoryLabel: string;
}) {
  const t = useTranslations("Releases");
  const err = (code?: string) =>
    code ? t(`errors.${code}` as Parameters<typeof t>[0]) : undefined;
  const [state, action] = useActionState(declareRights.bind(null, releaseId), initial);
  const v = state.values;
  const checkedCmo = v ? v.cmo.split(",").filter(Boolean) : [];
  const [samples, setSamples] = useState(v?.samples ?? "none");

  return (
    <form action={action} className="form-stack" noValidate>
      <p className="field__hint">{t("rights.lead")}</p>
      <FormMessage error={err(state.error)} saved={state.saved ? t("editor.saved") : undefined} />

      <CheckboxField
        key={`master-${v?.ownsMaster ?? ""}`}
        name="ownsMaster"
        label={t("rights.ownsMaster")}
        defaultChecked={v?.ownsMaster === "on"}
        error={err(state.fieldErrors?.ownsMaster)}
      />
      <CheckboxField
        key={`composition-${v?.controlsComposition ?? ""}`}
        name="controlsComposition"
        label={t("rights.controlsComposition")}
        defaultChecked={v?.controlsComposition === "on"}
      />

      <fieldset
        className="choice-group"
        aria-describedby={state.fieldErrors?.cmo ? "cmo-error" : undefined}
      >
        <legend className="field__label">{t("rights.cmoQuestion")}</legend>
        {CMO_OPTIONS.map((option) => (
          <label key={`${option}-${checkedCmo.includes(option)}`} className="choice-group__option">
            <input
              type="checkbox"
              name="cmo"
              value={option}
              defaultChecked={checkedCmo.includes(option)}
            />
            <span>{t(`rights.cmo.${option}`)}</span>
          </label>
        ))}
        {state.fieldErrors?.cmo ? (
          <p id="cmo-error" className="field__error">
            {err(state.fieldErrors.cmo)}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="choice-group">
        <legend className="field__label">{t("rights.samplesQuestion")}</legend>
        {(["none", "cleared"] as const).map((option) => (
          <label key={option} className="choice-group__option">
            <input
              type="radio"
              name="samples"
              value={option}
              checked={samples === option}
              onChange={() => setSamples(option)}
            />
            <span>{t(`rights.samples.${option}`)}</span>
          </label>
        ))}
      </fieldset>
      {samples === "cleared" ? (
        <TextareaField
          name="samplesDescription"
          label={t("rights.samplesDescription")}
          defaultValue={v?.samplesDescription}
          error={err(state.fieldErrors?.samplesDescription)}
          required
        />
      ) : null}

      <SelectField
        name="aiContent"
        label={t("rights.aiContent")}
        defaultValue={v?.aiContent ?? (defaultAi === "unknown" ? "" : defaultAi)}
        error={err(state.fieldErrors?.aiContent)}
        options={[
          { value: "", label: t("ai.unknown") },
          ...(["human", "ai_assisted", "ai_generated"] as const).map((value) => ({
            value,
            label: t(`ai.${value}`),
          })),
        ]}
      />
      <p className="field__hint">{t("rights.territories", { territory: territoryLabel })}</p>

      <CheckboxField
        key={`terms-${v?.acceptTerms ?? ""}`}
        name="acceptTerms"
        label={t("rights.acceptTerms", { version: ARTIST_TERMS_VERSION })}
        defaultChecked={v?.acceptTerms === "on"}
        error={err(state.fieldErrors?.acceptTerms)}
      />
      <p className="field__hint">
        {t("rights.legalNote")}{" "}
        <Link href="/artist-terms" target="_blank">
          {t("rights.readTerms")}
        </Link>
      </p>
      <Submit>{t("rights.submit")}</Submit>
    </form>
  );
}
