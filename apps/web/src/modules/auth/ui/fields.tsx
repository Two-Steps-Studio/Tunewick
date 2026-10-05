"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { useFormStatus } from "react-dom";
import type { AuthErrorCode } from "../validation";

export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
  required,
}: {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  defaultValue?: string;
  error?: AuthErrorCode;
  hint?: string;
  required?: boolean;
}) {
  const t = useTranslations("Auth.errors");
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="field__input"
      />
      {hint && !error ? (
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

export function CheckboxField({
  name,
  label,
  error,
}: {
  name: string;
  label: string;
  error?: AuthErrorCode;
}) {
  const t = useTranslations("Auth.errors");
  const id = useId();
  return (
    <div className="field field--checkbox">
      <input
        id={id}
        name={name}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="field__checkbox"
      />
      <label htmlFor={id}>{label}</label>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ error }: { error?: AuthErrorCode }) {
  const t = useTranslations("Auth.errors");
  if (!error) return null;
  return (
    <p role="alert" className="form-error">
      {t(error)}
    </p>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button button--primary" disabled={pending} aria-busy={pending}>
      {children}
    </button>
  );
}
