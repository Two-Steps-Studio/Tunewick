"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createCampaign,
  createSharedCode,
  generateCodes,
  type PromoFormState,
  revokeRedemption,
} from "../actions";
import { BENEFITS, toCsv } from "../validation";

const initial: PromoFormState = {};

function Submit({ label, quiet }: { label: string; quiet?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={quiet ? "button" : "button button--primary"}
      disabled={pending}
      aria-busy={pending}
    >
      {label}
    </button>
  );
}

function FormError({ state }: { state: PromoFormState }) {
  const t = useTranslations("PromoAdmin.errors");
  return state.error ? (
    <p role="alert" className="form-error">
      {t(state.error)}
    </p>
  ) : null;
}

function Input({
  name,
  label,
  hint,
  state,
  defaultValue,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  state: PromoFormState;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        {...props}
        id={id}
        name={name}
        className="field__input"
        // The submitted value survives a failed attempt (React resets forms after actions).
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Benefit, length, expiry and "new accounts only" — shared by both code forms. */
function BenefitFields({ state }: { state: PromoFormState }) {
  const t = useTranslations("PromoAdmin.fields");
  return (
    <>
      <div className="promo-form__row">
        <label className="field">
          <span className="field__label">{t("benefit")}</span>
          <select
            key={state.values?.benefit ?? "premium_days"}
            name="benefit"
            className="field__input"
            defaultValue={state.values?.benefit ?? "premium_days"}
          >
            {BENEFITS.map((b) => (
              <option key={b} value={b}>
                {t(`benefits.${b}`)}
              </option>
            ))}
          </select>
        </label>
        <Input
          name="value"
          label={t("value")}
          hint={t("valueHint")}
          state={state}
          inputMode="numeric"
          defaultValue="30"
        />
      </div>
      <div className="promo-form__row">
        <Input name="expiresOn" label={t("expiresOn")} state={state} type="date" />
        <Input
          name="newAccountsDays"
          label={t("newAccountsDays")}
          hint={t("newAccountsDaysHint")}
          state={state}
          inputMode="numeric"
        />
      </div>
    </>
  );
}

export function CampaignForm() {
  const t = useTranslations("PromoAdmin");
  const [state, action] = useActionState(createCampaign, initial);
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormError state={state} />
      <Input name="name" label={t("fields.name")} state={state} required maxLength={80} />
      <Input name="partner" label={t("fields.partner")} state={state} maxLength={120} />
      <Input name="description" label={t("fields.description")} state={state} maxLength={500} />
      <div className="promo-form__row">
        <Input name="endsOn" label={t("fields.endsOn")} state={state} type="date" />
        <Input
          name="maxTotal"
          label={t("fields.maxTotal")}
          hint={t("fields.maxTotalHint")}
          state={state}
          inputMode="numeric"
        />
      </div>
      <Submit label={t("createCampaign")} />
    </form>
  );
}

export function GenerateForm({
  campaign,
  campaignName,
}: {
  campaign: string;
  campaignName: string;
}) {
  const t = useTranslations("PromoAdmin");
  const [state, action] = useActionState(generateCodes.bind(null, campaign), initial);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.codes) result.current?.focus();
  }, [state.codes]);

  const download = () => {
    const blob = new Blob([toCsv(state.codes ?? [], campaignName)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tunewick-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormError state={state} />
      {state.codes ? (
        <div ref={result} tabIndex={-1} className="generated-codes" role="status">
          <p className="generated-codes__warning">
            {t("generated", { count: state.codes.length })}
          </p>
          <textarea
            readOnly
            className="field__input generated-codes__list"
            aria-label={t("generatedList")}
            rows={Math.min(state.codes.length, 10)}
            value={state.codes.join("\n")}
          />
          <button type="button" className="button button--primary" onClick={download}>
            {t("downloadCsv")}
          </button>
        </div>
      ) : null}
      <Input
        name="count"
        label={t("fields.count")}
        state={state}
        inputMode="numeric"
        defaultValue="50"
      />
      <BenefitFields state={state} />
      <Submit label={t("generate")} />
    </form>
  );
}

export function SharedCodeForm({ campaign }: { campaign: string }) {
  const t = useTranslations("PromoAdmin");
  const [state, action] = useActionState(createSharedCode.bind(null, campaign), initial);
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormError state={state} />
      {state.done ? (
        <p role="status" className="form-status">
          {t("sharedCreated")}
        </p>
      ) : null}
      <div className="promo-form__row">
        <Input
          name="code"
          label={t("fields.code")}
          hint={t("fields.codeHint")}
          state={state}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
        />
        <Input
          name="maxUses"
          label={t("fields.maxUses")}
          state={state}
          inputMode="numeric"
          defaultValue="100"
        />
      </div>
      <BenefitFields state={state} />
      <Submit label={t("createShared")} />
    </form>
  );
}

export function RevokeForm({ redemption }: { redemption: string }) {
  const t = useTranslations("PromoAdmin");
  const [state, action] = useActionState(revokeRedemption.bind(null, redemption), initial);
  return (
    <form action={action} className="revoke-form" noValidate>
      <FormError state={state} />
      <Input
        name="reason"
        label={t("fields.reason")}
        state={state}
        maxLength={500}
        autoComplete="off"
      />
      <Submit label={t("revoke")} quiet />
    </form>
  );
}
