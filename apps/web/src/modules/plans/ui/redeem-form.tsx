"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { type RedeemState, redeemCode } from "../actions";

function Submit() {
  const t = useTranslations("Plan.redeem");
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button" disabled={pending} aria-busy={pending}>
      {t("submit")}
    </button>
  );
}

/** "I have a code" — the result message comes from the database's typed reason. */
export function RedeemForm() {
  const t = useTranslations("Plan.redeem");
  const [state, action] = useActionState(redeemCode, {} as RedeemState);
  const id = useId();
  const failed = state.status && state.status !== "granted";

  return (
    <form action={action} className="redeem-form" noValidate>
      <div className="field">
        <label htmlFor={id} className="field__label">
          {t("label")}
        </label>
        <div className="redeem-form__row">
          <input
            key={state.code ?? ""}
            id={id}
            name="code"
            defaultValue={state.code ?? ""}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            aria-invalid={failed ? true : undefined}
            aria-describedby={state.status ? `${id}-result` : undefined}
            className="field__input redeem-form__input"
          />
          <Submit />
        </div>
      </div>
      {state.status === "granted" ? (
        <p id={`${id}-result`} role="status" className="form-status">
          {t("granted")}
        </p>
      ) : state.status ? (
        <p id={`${id}-result`} role="alert" className="field__error">
          {t(`errors.${state.status}`)}
        </p>
      ) : null}
    </form>
  );
}
