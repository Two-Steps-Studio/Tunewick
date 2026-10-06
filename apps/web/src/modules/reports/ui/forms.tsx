"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  CheckboxField,
  FormMessage,
  InputField,
  SelectField,
  Submit,
  TextareaField,
} from "@/components/form/field";
import {
  type AppealFormState,
  appealDecision,
  type DecisionFormState,
  decideAppeal,
  moderateReport,
  type ReportFormState,
  submitReport,
} from "../actions";
import { type ModerationAction, REPORT_REASONS, type ReportSubject } from "../constants";

/** Notice form (DSA): reason, details; copyright notices also need the claimant. */
export function ReportForm({
  subjectType,
  subjectId,
}: {
  subjectType: ReportSubject;
  subjectId: string;
}) {
  const t = useTranslations("Reports");
  const [state, action] = useActionState(
    submitReport.bind(null, subjectType, subjectId),
    {} as ReportFormState,
  );
  const [reason, setReason] = useState(state.values?.reason ?? "other");

  if (state.sent) {
    return (
      <p role="status" className="form-status">
        {t("sent")}
      </p>
    );
  }
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormMessage error={state.error ? t(`errors.${state.error}`) : undefined} />
      <SelectField
        name="reason"
        label={t("fields.reason")}
        defaultValue={reason}
        onChange={(event) => setReason(event.target.value)}
        options={REPORT_REASONS.map((r) => ({ value: r, label: t(`reasons.${r}`) }))}
      />
      <TextareaField
        name="details"
        label={t("fields.details")}
        hint={t("hints.details")}
        rows={5}
        maxLength={2000}
        defaultValue={state.values?.details}
        required
      />
      {reason === "copyright" ? (
        <fieldset className="settings-form__group">
          <legend>{t("copyright.title")}</legend>
          <p className="field__hint">{t("copyright.lead")}</p>
          <InputField
            name="claimantName"
            label={t("fields.claimantName")}
            defaultValue={state.values?.claimantName}
            autoComplete="name"
            required
          />
          <InputField
            name="claimantEmail"
            type="email"
            label={t("fields.claimantEmail")}
            defaultValue={state.values?.claimantEmail}
            autoComplete="email"
            required
          />
          <CheckboxField
            name="goodFaith"
            label={t("fields.goodFaith")}
            defaultChecked={state.values?.goodFaith === "on"}
          />
        </fieldset>
      ) : null}
      <Submit>{t("submit")}</Submit>
    </form>
  );
}

const ACTIONS: Record<ReportSubject, ModerationAction[]> = {
  release: ["takedown_release", "dismiss"],
  artist: ["suspend_artist", "dismiss"],
  playlist: ["hide_playlist", "dismiss"],
};

export function ModerateReportForm({
  reportId,
  subjectType,
}: {
  reportId: string;
  subjectType: ReportSubject;
}) {
  const t = useTranslations("Reports.moderation");
  const [state, action] = useActionState(
    moderateReport.bind(null, reportId),
    {} as DecisionFormState,
  );
  return (
    <form action={action} className="form-stack decision-form" noValidate>
      <FormMessage error={state.error ? t(`errors.${state.error}`) : undefined} />
      <SelectField
        name="action"
        label={t("action")}
        defaultValue={state.values?.action ?? ACTIONS[subjectType][0]}
        options={ACTIONS[subjectType].map((a) => ({ value: a, label: t(`actions.${a}`) }))}
      />
      <TextareaField
        name="statement"
        label={t("statement")}
        hint={t("statementHint")}
        rows={3}
        maxLength={4000}
        defaultValue={state.values?.statement}
      />
      <Submit>{t("decide")}</Submit>
    </form>
  );
}

export function AppealDecisionForm({ decisionId }: { decisionId: string }) {
  const t = useTranslations("Reports.moderation");
  const [state, action] = useActionState(
    decideAppeal.bind(null, decisionId),
    {} as DecisionFormState,
  );
  return (
    <form action={action} className="form-stack decision-form" noValidate>
      <FormMessage error={state.error ? t(`errors.${state.error}`) : undefined} />
      <TextareaField
        name="note"
        label={t("appealNote")}
        hint={t("statementHint")}
        rows={3}
        maxLength={4000}
        defaultValue={state.values?.note}
      />
      <div className="decision-form__buttons">
        <button type="submit" name="outcome" value="reverse" className="button button--primary">
          {t("reverse")}
        </button>
        <button type="submit" name="outcome" value="uphold" className="button button--quiet">
          {t("uphold")}
        </button>
      </div>
    </form>
  );
}

export function AppealForm({ decisionId }: { decisionId: string }) {
  const t = useTranslations("Reports.decisions");
  const [state, action] = useActionState(
    appealDecision.bind(null, decisionId),
    {} as AppealFormState,
  );
  return (
    <form action={action} className="form-stack" noValidate>
      <FormMessage error={state.error ? t(`errors.${state.error}`) : undefined} />
      <TextareaField
        name="appeal"
        label={t("appeal")}
        hint={t("appealHint")}
        rows={3}
        maxLength={4000}
        defaultValue={state.values?.appeal}
      />
      <Submit variant="quiet">{t("sendAppeal")}</Submit>
    </form>
  );
}
