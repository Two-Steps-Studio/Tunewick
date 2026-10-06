"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { updateSettings } from "../actions";
import type { SettingsErrorCode, SettingsFormState } from "../validation";

interface Values {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  locale: string;
  activityVisibility: "public" | "followers" | "private";
}

interface ControlProps {
  id: string;
  describedBy?: string;
  invalid?: true;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: SettingsErrorCode;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const t = useTranslations("Settings.errors");
  const id = useId();
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {children({ id, describedBy, invalid: error ? true : undefined })}
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

function Submit() {
  const t = useTranslations("Settings");
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button button--primary" disabled={pending} aria-busy={pending}>
      {t("submit")}
    </button>
  );
}

export function SettingsForm({ values }: { values: Values }) {
  const t = useTranslations("Settings");
  const tErrors = useTranslations("Settings.errors");
  const [state, action] = useActionState(updateSettings, {} as SettingsFormState);

  return (
    <form action={action} className="settings-form" noValidate>
      {state.error ? (
        <p role="alert" className="form-error">
          {tErrors(state.error)}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="form-status">
          {t("saved")}
        </p>
      ) : null}

      <fieldset className="settings-form__group">
        <legend>{t("publicSection")}</legend>
        <p className="field__hint">{t("publicHint")}</p>
        <Field
          label={t("fields.handle")}
          hint={t("hints.handle")}
          error={state.fieldErrors?.handle}
        >
          {(p) => (
            <input
              id={p.id}
              name="handle"
              defaultValue={values.handle ?? ""}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              className="field__input"
            />
          )}
        </Field>
        <Field label={t("fields.displayName")} error={state.fieldErrors?.displayName}>
          {(p) => (
            <input
              id={p.id}
              name="displayName"
              defaultValue={values.displayName ?? ""}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              className="field__input"
            />
          )}
        </Field>
        <Field label={t("fields.bio")} hint={t("hints.bio")} error={state.fieldErrors?.bio}>
          {(p) => (
            <textarea
              id={p.id}
              name="bio"
              rows={4}
              defaultValue={values.bio ?? ""}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              className="field__input field__textarea"
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="settings-form__group">
        <legend>{t("privateSection")}</legend>
        <p className="field__hint">{t("privateHint")}</p>
        <Field label={t("fields.locale")}>
          {(p) => (
            <select id={p.id} name="locale" defaultValue={values.locale} className="field__input">
              <option value="pl">{t("locales.pl")}</option>
              <option value="en">{t("locales.en")}</option>
            </select>
          )}
        </Field>
        <Field label={t("fields.visibility")} hint={t("hints.visibility")}>
          {(p) => (
            <select
              id={p.id}
              name="activityVisibility"
              defaultValue={values.activityVisibility}
              aria-describedby={p.describedBy}
              className="field__input"
            >
              <option value="public">{t("visibility.public")}</option>
              <option value="followers">{t("visibility.followers")}</option>
              <option value="private">{t("visibility.private")}</option>
            </select>
          )}
        </Field>
      </fieldset>

      <Submit />
    </form>
  );
}
