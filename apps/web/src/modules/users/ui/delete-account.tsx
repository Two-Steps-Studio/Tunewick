"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormMessage, InputField, Submit } from "@/components/form/field";
import { type DeleteAccountState, deleteAccount } from "../actions";

/** Two steps: open the form, then type the email to confirm. Cannot be undone. */
export function DeleteAccountForm() {
  const t = useTranslations("Privacy");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAccount, {} as DeleteAccountState);

  if (!open && !state.error) {
    return (
      <button type="button" className="button" onClick={() => setOpen(true)}>
        {t("delete")}
      </button>
    );
  }
  return (
    <form action={action} className="form-stack" noValidate>
      <FormMessage error={state.error ? t(`errors.${state.error}`) : undefined} />
      <p className="form-status">{t("deleteWarning")}</p>
      <InputField
        name="email"
        type="email"
        label={t("confirmEmail")}
        autoComplete="off"
        defaultValue={state.email}
      />
      <div className="decision-form__buttons">
        <Submit>{t("deleteForever")}</Submit>
        <button type="button" className="button button--quiet" onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
