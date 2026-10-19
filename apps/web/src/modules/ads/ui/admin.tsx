"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { type AdFormState, saveAdCampaign, setAdCampaignActive } from "../actions";
import type { AdminAdCampaign } from "../queries";
import { AD_LOCALES, AD_PLACEMENTS } from "../constants";

const initial: AdFormState = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button button--primary" disabled={pending} aria-busy={pending}>
      {label}
    </button>
  );
}

function Field({
  name,
  label,
  hint,
  value,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  value: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value">) {
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
        defaultValue={value}
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

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }) : "";

/** Create a campaign (no `campaign`) or edit one. */
export function AdCampaignForm({ campaign }: { campaign?: AdminAdCampaign }) {
  const t = useTranslations("AdsAdmin");
  const [state, action] = useActionState(saveAdCampaign.bind(null, campaign?.id ?? null), initial);
  const text = (name: string, fallback: string) => {
    const v = state.values?.[name];
    return typeof v === "string" ? v : fallback;
  };
  const list = (name: string, fallback: string[]) => {
    const v = state.values?.[name];
    return Array.isArray(v) ? v : fallback;
  };
  const placements = list("placements", campaign?.placements ?? []);
  const locales = list("locales", campaign?.locales ?? []);

  return (
    <form action={action} className="settings-form">
      {state.error ? (
        <p role="alert" className="form-error">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="field__hint">
          {t("saved")}
        </p>
      ) : null}
      <Field
        name="advertiser"
        label={t("fields.advertiser")}
        value={text("advertiser", campaign?.advertiser ?? "")}
        required
        maxLength={80}
      />
      <Field
        name="headline"
        label={t("fields.headline")}
        value={text("headline", campaign?.headline ?? "")}
        required
        maxLength={80}
      />
      <Field
        name="body"
        label={t("fields.body")}
        value={text("body", campaign?.body ?? "")}
        maxLength={160}
      />
      <Field
        name="cta"
        label={t("fields.cta")}
        hint={t("hints.cta")}
        value={text("cta", campaign?.cta ?? "")}
        required
        maxLength={24}
      />
      <Field
        name="url"
        type="url"
        label={t("fields.url")}
        hint={t("hints.url")}
        value={text("url", campaign?.url ?? "")}
        maxLength={500}
      />
      <Field
        name="release"
        label={t("fields.release")}
        hint={
          campaign?.release_title
            ? t("hints.releaseCurrent", { title: campaign.release_title })
            : t("hints.release")
        }
        value={text("release", campaign?.release_ref ?? "")}
        placeholder="artysta/wydawnictwo"
      />
      <fieldset className="field">
        <legend className="field__label">{t("fields.placements")}</legend>
        <div className="region-filter region-filter--wrap">
          {AD_PLACEMENTS.map((p) => (
            <label key={p} className="chip">
              <input
                type="checkbox"
                name="placements"
                value={p}
                defaultChecked={placements.includes(p)}
              />{" "}
              {t(`placements.${p}`)}
            </label>
          ))}
        </div>
        <p className="field__hint">{t("hints.placements")}</p>
      </fieldset>
      <fieldset className="field">
        <legend className="field__label">{t("fields.locales")}</legend>
        <div className="region-filter region-filter--wrap">
          {AD_LOCALES.map((l) => (
            <label key={l} className="chip">
              <input
                type="checkbox"
                name="locales"
                value={l}
                defaultChecked={locales.includes(l)}
              />{" "}
              {l.toUpperCase()}
            </label>
          ))}
        </div>
        <p className="field__hint">{t("hints.locales")}</p>
      </fieldset>
      <Field
        name="weight"
        type="number"
        min={1}
        max={10}
        label={t("fields.weight")}
        hint={t("hints.weight")}
        value={text("weight", String(campaign?.weight ?? 1))}
      />
      <Field
        name="startsOn"
        type="date"
        label={t("fields.startsOn")}
        value={text("startsOn", day(campaign?.starts_at ?? null))}
      />
      <Field
        name="endsOn"
        type="date"
        label={t("fields.endsOn")}
        value={text("endsOn", day(campaign?.ends_at ?? null))}
      />
      <Submit label={campaign ? t("save") : t("create")} />
    </form>
  );
}

export function AdCampaignToggle({ campaign, active }: { campaign: string; active: boolean }) {
  const t = useTranslations("AdsAdmin");
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => start(async () => void (await setAdCampaignActive(campaign, !active)))}
    >
      {active ? t("pause") : t("start")}
    </button>
  );
}
