"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage, InputField, SelectField, Submit } from "@/components/form/field";
import { type AdminFormState, grantPremium, grantStaffRole } from "../actions";

export function GrantRoleForm() {
  const t = useTranslations("Admin");
  const [state, action] = useActionState(grantStaffRole, {} as AdminFormState);
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormMessage
        error={state.error ? t(`errors.${state.error}`) : undefined}
        saved={state.done ? t("roleGranted") : undefined}
      />
      <div className="promo-form__row">
        <InputField
          name="handle"
          label={t("fields.handle")}
          hint={t("fields.handleHint")}
          defaultValue={state.values?.handle}
          autoCapitalize="none"
          spellCheck={false}
        />
        <SelectField
          name="role"
          label={t("fields.role")}
          defaultValue={state.values?.role ?? "moderator"}
          options={[
            { value: "moderator", label: t("roles.moderator") },
            { value: "admin", label: t("roles.admin") },
          ]}
        />
      </div>
      <Submit>{t("grantRole")}</Submit>
    </form>
  );
}

export function GrantPremiumForm() {
  const t = useTranslations("Admin");
  const [state, action] = useActionState(grantPremium, {} as AdminFormState);
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormMessage
        error={state.error ? t(`errors.${state.error}`) : undefined}
        saved={state.done ? t("premiumGranted") : undefined}
      />
      <div className="promo-form__row">
        <InputField
          name="handle"
          label={t("fields.handle")}
          defaultValue={state.values?.handle}
          autoCapitalize="none"
          spellCheck={false}
        />
        <InputField
          name="days"
          label={t("fields.days")}
          hint={t("fields.daysHint")}
          inputMode="numeric"
          defaultValue={state.values?.days ?? "30"}
        />
      </div>
      <InputField
        name="note"
        label={t("fields.note")}
        hint={t("fields.noteHint")}
        maxLength={120}
        defaultValue={state.values?.note}
      />
      <Submit>{t("grantPremium")}</Submit>
    </form>
  );
}
