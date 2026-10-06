"use client";

import { useId } from "react";
import { useFormStatus } from "react-dom";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "className">;
type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className">;

interface FieldProps {
  label: string;
  hint?: string;
  /** Already translated error message. */
  error?: string;
}

function describedBy(id: string, hint?: string, error?: string) {
  return (
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

function Messages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function InputField({ label, hint, error, ...input }: FieldProps & InputProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        {...input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className="field__input"
      />
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextareaField({ label, hint, error, ...textarea }: FieldProps & TextareaProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        {...textarea}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className="field__input field__textarea"
      />
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  options,
  ...select
}: FieldProps &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id" | "className"> & {
    options: { value: string; label: string }[];
  }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <select
        id={id}
        {...select}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className="field__input"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export function FormMessage({ error, saved }: { error?: string; saved?: string }) {
  if (error) {
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    );
  }
  if (saved) {
    return (
      <p role="status" className="form-status">
        {saved}
      </p>
    );
  }
  return null;
}

export function Submit({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`button button--${variant}`}
      disabled={pending}
      aria-busy={pending}
    >
      {children}
    </button>
  );
}
