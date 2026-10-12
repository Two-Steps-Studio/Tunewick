"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateDiscoveryPrivacy, type DiscoveryPrivacyState } from "../actions";

type Level = "public" | "followers" | "private";

export interface DiscoveryPrivacyValues {
  profilePublic: boolean;
  stats: Level;
  score: Level;
  badges: Level;
  replay: Level;
}

const FIELDS = ["stats", "score", "badges", "replay"] as const;

function Save() {
  const t = useTranslations("DiscoveryPrivacy");
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button button--primary" disabled={pending}>
      {pending ? t("saving") : t("save")}
    </button>
  );
}

/** Profile visibility and who sees statistics, Discovery Score, badges and Replay. */
export function DiscoveryPrivacyForm({ values }: { values: DiscoveryPrivacyValues }) {
  const t = useTranslations("DiscoveryPrivacy");
  const [state, action] = useActionState<DiscoveryPrivacyState, FormData>(
    updateDiscoveryPrivacy,
    {},
  );
  return (
    <form action={action} className="settings-form" aria-labelledby="discovery-privacy">
      <fieldset className="settings-form__group">
        <legend id="discovery-privacy">{t("title")}</legend>
        <p className="field__hint">{t("lead")}</p>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            name="profilePublic"
            defaultChecked={values.profilePublic}
            className="field__checkbox"
          />
          <span className="field__label">{t("profilePublic")}</span>
          <span className="field__hint" style={{ gridColumn: "2" }}>
            {t("profilePublicHint")}
          </span>
        </label>
        {FIELDS.map((field) => (
          <div key={field} className="field">
            <label htmlFor={`privacy-${field}`} className="field__label">
              {t(`fields.${field}`)}
            </label>
            <select
              id={`privacy-${field}`}
              name={field}
              defaultValue={values[field]}
              className="field__input"
            >
              <option value="public">{t("levels.public")}</option>
              <option value="followers">{t("levels.followers")}</option>
              <option value="private">{t("levels.private")}</option>
            </select>
          </div>
        ))}
      </fieldset>
      {state.saved || state.error ? (
        <p role="status" className="field__hint">
          {state.saved ? t("saved") : t("error")}
        </p>
      ) : null}
      <Save />
    </form>
  );
}
