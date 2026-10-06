"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { type DecisionState, decide } from "../actions";

const initial: DecisionState = {};

export function DecisionForm({ releaseId }: { releaseId: string }) {
  const t = useTranslations("Moderation.decision");
  const [state, action, pending] = useActionState(decide.bind(null, releaseId), initial);
  return (
    <form action={action} className="form-stack decision-form" noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
      <label className="field">
        <span className="field__label">{t("note")}</span>
        <textarea
          name="note"
          className="field__input"
          rows={4}
          maxLength={2000}
          defaultValue={state.note ?? ""}
          aria-describedby="decision-note-hint"
        />
        <span id="decision-note-hint" className="field__hint">
          {t("noteHint")}
        </span>
      </label>
      <div className="decision-form__buttons">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="button button--primary"
          disabled={pending}
        >
          {t("approve")}
        </button>
        <button
          type="submit"
          name="decision"
          value="return"
          className="button button--quiet"
          disabled={pending}
        >
          {t("return")}
        </button>
      </div>
    </form>
  );
}
