"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signOut, signUp, updatePassword } from "../actions";
import type { AuthErrorCode, AuthFormState } from "../validation";
import { CheckboxField, FormError, SubmitButton, TextField } from "./fields";

const initial: AuthFormState = {};

export function SignUpForm({ inviteRequired }: { inviteRequired: boolean }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState(signUp, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <FormError error={state.error} />
      <TextField
        name="email"
        type="email"
        label={t("fields.email")}
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <TextField
        name="password"
        type="password"
        label={t("fields.password")}
        autoComplete="new-password"
        hint={t("hints.password")}
        error={state.fieldErrors?.password}
        required
      />
      <TextField
        name="displayName"
        label={t("fields.displayName")}
        autoComplete="nickname"
        defaultValue={state.values?.displayName}
        error={state.fieldErrors?.displayName}
      />
      {inviteRequired ? (
        <TextField
          name="inviteCode"
          label={t("fields.inviteCode")}
          hint={t("hints.inviteCode")}
          autoComplete="off"
          defaultValue={state.values?.inviteCode}
          error={state.fieldErrors?.inviteCode}
          required
        />
      ) : null}
      <CheckboxField
        name="ageConfirmed"
        label={t("fields.ageConfirmed")}
        error={state.fieldErrors?.ageConfirmed}
      />
      <SubmitButton>{t("signup.submit")}</SubmitButton>
    </form>
  );
}

export function SignInForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: AuthErrorCode;
}) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState(signIn, { error: initialError });
  return (
    <form action={action} className="auth-form" noValidate>
      <FormError error={state.error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TextField
        name="email"
        type="email"
        label={t("fields.email")}
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <TextField
        name="password"
        type="password"
        label={t("fields.password")}
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
      <SubmitButton>{t("login.submit")}</SubmitButton>
    </form>
  );
}

export function ResetRequestForm() {
  const t = useTranslations("Auth");
  const [state, action] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <FormError error={state.error} />
      <TextField
        name="email"
        type="email"
        label={t("fields.email")}
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
        required
      />
      <SubmitButton>{t("reset.submit")}</SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm() {
  const t = useTranslations("Auth");
  const [state, action] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="auth-form" noValidate>
      <FormError error={state.error} />
      <TextField
        name="password"
        type="password"
        label={t("fields.newPassword")}
        autoComplete="new-password"
        hint={t("hints.password")}
        error={state.fieldErrors?.password}
        required
      />
      <TextField
        name="confirmPassword"
        type="password"
        label={t("fields.confirmPassword")}
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        required
      />
      <SubmitButton>{t("update.submit")}</SubmitButton>
    </form>
  );
}

export function SignOutButton() {
  const t = useTranslations("Account");
  return (
    <form action={signOut}>
      <button type="submit" className="button button--quiet">
        {t("signOut")}
      </button>
    </form>
  );
}
