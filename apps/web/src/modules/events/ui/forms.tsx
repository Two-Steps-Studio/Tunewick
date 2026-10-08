"use client";

import { VOIVODESHIPS } from "@tunewick/shared";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import {
  FormMessage,
  InputField,
  SelectField,
  Submit,
  TextareaField,
} from "@/components/form/field";
import { createEvent, type EventFormState, type ReviewEventState, reviewEvent } from "../actions";

export function EventForm({ artistId }: { artistId: string }) {
  const t = useTranslations("Events.form");
  const tPlaces = useTranslations("Places");
  const [state, action] = useActionState(createEvent.bind(null, artistId), {} as EventFormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      <FormMessage
        error={state.error ? t(`errors.${state.error}`) : undefined}
        saved={state.saved ? t("saved") : undefined}
      />
      <InputField name="title" label={t("title")} defaultValue={v.title} maxLength={160} />
      <InputField
        name="startsAt"
        type="datetime-local"
        label={t("startsAt")}
        hint={t("startsAtHint")}
        defaultValue={v.startsAt}
      />
      <fieldset className="settings-form__group">
        <legend>{t("venue")}</legend>
        <InputField name="venueName" label={t("venueName")} defaultValue={v.venueName} />
        <div className="promo-form__row">
          <InputField name="city" label={t("city")} defaultValue={v.city} />
          <SelectField
            name="voivodeship"
            label={tPlaces("voivodeshipLabel")}
            defaultValue={v.voivodeship ?? ""}
            options={[
              { value: "", label: "—" },
              ...VOIVODESHIPS.map((x) => ({ value: x, label: tPlaces(`voivodeship.${x}`) })),
            ]}
          />
        </div>
        <InputField name="address" label={t("address")} defaultValue={v.address} />
      </fieldset>
      <InputField
        name="lineup"
        label={t("lineup")}
        hint={t("lineupHint")}
        defaultValue={v.lineup}
        autoCapitalize="none"
        spellCheck={false}
      />
      <InputField
        name="ticketUrl"
        type="url"
        label={t("ticketUrl")}
        defaultValue={v.ticketUrl}
        placeholder="https://"
      />
      <TextareaField
        name="description"
        label={t("description")}
        rows={3}
        maxLength={2000}
        defaultValue={v.description}
      />
      <Submit>{t("submit")}</Submit>
    </form>
  );
}

export function EventReviewForm({ eventId, title }: { eventId: string; title: string }) {
  const t = useTranslations("Events.review");
  const [state, action, pending] = useActionState(
    reviewEvent.bind(null, eventId),
    {} as ReviewEventState,
  );
  const noteId = useId();
  return (
    <form action={action} className="form-stack decision-form" noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor={noteId} className="field__label">
          {t("note", { title })}
        </label>
        <textarea
          id={noteId}
          name="note"
          className="field__input"
          rows={2}
          maxLength={2000}
          defaultValue={state.note ?? ""}
        />
      </div>
      <div className="decision-form__buttons">
        <button
          type="submit"
          name="decision"
          value="publish"
          className="button button--primary"
          disabled={pending}
        >
          {t("publish", { title })}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          className="button button--quiet"
          disabled={pending}
        >
          {t("reject", { title })}
        </button>
      </div>
    </form>
  );
}
