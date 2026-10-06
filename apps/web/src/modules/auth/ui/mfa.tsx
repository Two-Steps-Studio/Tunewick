"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useState, useTransition } from "react";
import {
  confirmTotpEnrollment,
  disableTotp,
  type EnrollState,
  type MfaErrorCode,
  startTotpEnrollment,
  verifySignIn,
} from "../mfa-actions";
import { SubmitButton } from "./fields";

function CodeField({ error }: { error?: MfaErrorCode }) {
  const t = useTranslations("Security");
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {t("code")}
      </label>
      <input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={7}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="field__input field__input--code"
      />
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}

/** Enrollment: start → scan QR / enter key → confirm with the first code. */
export function TotpEnrollment() {
  const t = useTranslations("Security");
  const [started, setStarted] = useState<EnrollState | null>(null);
  const [pending, startTransition] = useTransition();

  if (!started || !started.factorId) {
    return (
      <div className="mfa-step">
        {started?.error ? (
          <p role="alert" className="form-error">
            {t(`errors.${started.error}`)}
          </p>
        ) : null}
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          aria-busy={pending}
          onClick={() => startTransition(async () => setStarted(await startTotpEnrollment()))}
        >
          {t("enable")}
        </button>
      </div>
    );
  }
  return <TotpConfirm initial={started} />;
}

function TotpConfirm({ initial }: { initial: EnrollState }) {
  const t = useTranslations("Security");
  const [state, action] = useActionState(confirmTotpEnrollment, initial);
  return (
    <form action={action} className="auth-form mfa-step" noValidate>
      <p>{t("scan")}</p>
      {/* Supabase returns the QR code as an SVG data URI. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qrCode} alt={t("qrAlt")} width={200} height={200} className="mfa-qr" />
      <div className="field">
        <span className="field__label">{t("secretLabel")}</span>
        <code className="mfa-secret" data-testid="totp-secret">
          {state.secret}
        </code>
      </div>
      <CodeField error={state.error} />
      <SubmitButton>{t("confirm")}</SubmitButton>
    </form>
  );
}

export function TotpDisable() {
  const t = useTranslations("Security");
  return (
    <form action={disableTotp}>
      <button type="submit" className="button button--quiet">
        {t("disable")}
      </button>
    </form>
  );
}

export function MfaVerifyForm({ next }: { next?: string }) {
  const t = useTranslations("Security");
  const [state, action] = useActionState(verifySignIn, {});
  return (
    <form action={action} className="auth-form" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <CodeField error={state.error} />
      <SubmitButton>{t("verify.submit")}</SubmitButton>
    </form>
  );
}
