"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { decideVerification, type VerificationState } from "../actions";

const initial: VerificationState = {};

export function VerificationDecisionForm({
  requestId,
  artistName,
}: {
  requestId: string;
  artistName: string;
}) {
  const t = useTranslations("Moderation.verification");
  const [state, action, pending] = useActionState(
    decideVerification.bind(null, requestId),
    initial,
  );
  const noteId = useId();
  return (
    <form action={action} className="form-stack decision-form" noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {t(`error.${state.error}`)}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor={noteId} className="field__label">
          {t("note", { artist: artistName })}
        </label>
        <textarea
          id={noteId}
          name="note"
          className="field__input"
          rows={2}
          maxLength={2000}
          defaultValue={state.note ?? ""}
          aria-describedby={`${noteId}-hint`}
        />
        <p id={`${noteId}-hint`} className="field__hint">
          {t("noteHint")}
        </p>
      </div>
      <div className="decision-form__buttons">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="button button--primary"
          disabled={pending}
        >
          {t("approve", { artist: artistName })}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          className="button button--quiet"
          disabled={pending}
        >
          {t("reject", { artist: artistName })}
        </button>
      </div>
    </form>
  );
}
