"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  CheckboxField,
  FormMessage,
  InputField,
  SelectField,
  Submit,
} from "@/components/form/field";
import { slugify } from "@/lib/slug";
import {
  addCredit,
  addTrack,
  createRelease,
  deleteCredit,
  deleteRelease,
  deleteTrack,
  moveTrack,
  setGenres,
  updateRelease,
  updateTrack,
} from "../actions";
import {
  AI_CONTENT,
  CREDIT_ROLES,
  RELEASE_TYPES,
  type ReleaseFormState,
  TERRITORIES,
} from "../validation";

const initial: ReleaseFormState = {};

function useText() {
  const t = useTranslations("Releases");
  const err = (code?: string) =>
    code ? t(`errors.${code}` as Parameters<typeof t>[0]) : undefined;
  return { t, err };
}

export function NewReleaseForm({ artist }: { artist: { id: string; slug: string } }) {
  const { t, err } = useText();
  const [state, action] = useActionState(createRelease.bind(null, artist), initial);
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className="auth-form" noValidate>
      <FormMessage error={err(state.error)} />
      <InputField
        name="title"
        label={t("fields.title")}
        defaultValue={state.values?.title}
        error={err(state.fieldErrors?.title)}
        required
        onChange={(e) => !touched && setSlug(slugify(e.target.value, 80))}
      />
      <InputField
        name="slug"
        label={t("fields.slug")}
        value={slug}
        onChange={(e) => {
          setTouched(true);
          setSlug(e.target.value);
        }}
        autoCapitalize="none"
        spellCheck={false}
        error={err(state.fieldErrors?.slug)}
        required
      />
      <SelectField
        name="type"
        label={t("fields.type")}
        defaultValue={state.values?.type ?? "single"}
        options={RELEASE_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
      />
      <Submit>{t("create.submit")}</Submit>
    </form>
  );
}

interface ReleaseValues {
  id: string;
  slug: string;
  title: string;
  type: (typeof RELEASE_TYPES)[number];
  release_date: string | null;
  explicit: boolean;
  ai_content: (typeof AI_CONTENT)[number];
  territories: string[];
  upc: string | null;
  p_line: string | null;
  c_line: string | null;
}

export function ReleaseDetailsForm({
  release,
  artistSlug,
}: {
  release: ReleaseValues;
  artistSlug: string;
}) {
  const { t, err } = useText();
  const [state, action] = useActionState(
    updateRelease.bind(null, { releaseId: release.id, artistSlug, slug: release.slug }),
    initial,
  );
  const territory = TERRITORIES.find((v) => release.territories.includes(v)) ?? "WORLD";
  // After a failed save the submitted values win over the saved ones (form reset).
  const v = state.values;
  return (
    <form action={action} className="form-stack" noValidate>
      <FormMessage error={err(state.error)} saved={state.saved ? t("editor.saved") : undefined} />
      <InputField
        name="title"
        label={t("fields.title")}
        defaultValue={v?.title ?? release.title}
        error={err(state.fieldErrors?.title)}
        required
      />
      <InputField
        name="slug"
        label={t("fields.slug")}
        defaultValue={v?.slug ?? release.slug}
        autoCapitalize="none"
        spellCheck={false}
        error={err(state.fieldErrors?.slug)}
        required
      />
      <SelectField
        name="type"
        label={t("fields.type")}
        defaultValue={v?.type ?? release.type}
        options={RELEASE_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
      />
      <InputField
        name="releaseDate"
        type="date"
        label={t("fields.releaseDate")}
        defaultValue={v?.releaseDate ?? release.release_date ?? ""}
        error={err(state.fieldErrors?.releaseDate)}
      />
      <SelectField
        name="aiContent"
        label={t("fields.aiContent")}
        defaultValue={v?.aiContent ?? release.ai_content}
        options={AI_CONTENT.map((v) => ({ value: v, label: t(`ai.${v}`) }))}
      />
      <CheckboxField
        name="explicit"
        label={t("fields.explicit")}
        defaultChecked={v ? v.explicit === "on" : release.explicit}
      />
      <SelectField
        name="territory"
        label={t("fields.territories")}
        defaultValue={v?.territory ?? territory}
        options={TERRITORIES.map((v) => ({ value: v, label: t(`territories.${v}`) }))}
      />
      <InputField
        name="upc"
        label={t("fields.upc")}
        inputMode="numeric"
        defaultValue={v?.upc ?? release.upc ?? ""}
        error={err(state.fieldErrors?.upc)}
      />
      <InputField
        name="pLine"
        label={t("fields.pLine")}
        defaultValue={v?.pLine ?? release.p_line ?? ""}
        error={err(state.fieldErrors?.pLine)}
      />
      <InputField
        name="cLine"
        label={t("fields.cLine")}
        defaultValue={v?.cLine ?? release.c_line ?? ""}
        error={err(state.fieldErrors?.cLine)}
      />
      <Submit>{t("editor.save")}</Submit>
    </form>
  );
}

export function GenresForm({
  releaseId,
  selected,
  genres,
}: {
  releaseId: string;
  selected: number[];
  genres: { id: number; name_pl: string; name_en: string }[];
}) {
  const { t, err } = useText();
  const locale = useLocale();
  const [state, action] = useActionState(setGenres.bind(null, releaseId), initial);
  // After a failed save the submitted choice wins over the saved one (form reset).
  const checked =
    state.values?.genres !== undefined
      ? state.values.genres.split(",").filter(Boolean).map(Number)
      : selected;
  return (
    <form action={action} className="form-stack">
      <FormMessage error={err(state.error)} saved={state.saved ? t("editor.saved") : undefined} />
      <fieldset className="genre-picker">
        <legend className="field__hint">{t("editor.genresHint")}</legend>
        {genres.map((g) => (
          <label key={g.id} className="genre-picker__option">
            <input
              key={String(checked.includes(g.id))}
              type="checkbox"
              name="genre"
              value={g.id}
              defaultChecked={checked.includes(g.id)}
            />
            <span>{locale === "pl" ? g.name_pl : g.name_en}</span>
          </label>
        ))}
      </fieldset>
      <Submit variant="quiet">{t("editor.save")}</Submit>
    </form>
  );
}

export function AddTrackForm({ releaseId }: { releaseId: string }) {
  const { t, err } = useText();
  const [state, action] = useActionState(addTrack.bind(null, releaseId), initial);
  return (
    <form action={action} className="form-stack track-add">
      <InputField
        name="title"
        label={t("editor.trackTitle")}
        error={err(state.fieldErrors?.title)}
        required
      />
      <Submit variant="quiet">{t("editor.addTrack")}</Submit>
    </form>
  );
}

interface TrackValues {
  id: string;
  track_number: number;
  title: string;
  isrc: string | null;
  explicit: boolean;
  ai_content: (typeof AI_CONTENT)[number];
  credits: {
    id: string;
    name: string;
    role: (typeof CREDIT_ROLES)[number];
    detail: string | null;
  }[];
}

export function TrackItem({
  track,
  isFirst,
  isLast,
  editable,
  children,
}: {
  track: TrackValues;
  isFirst: boolean;
  isLast: boolean;
  editable: boolean;
  /** Extra per-track content composed by the page (e.g. the master upload from the audio module). */
  children?: React.ReactNode;
}) {
  const { t, err } = useText();
  const [state, action] = useActionState(updateTrack.bind(null, track.id), initial);
  const [creditState, creditAction] = useActionState(addCredit.bind(null, track.id), initial);

  return (
    <li className="track-item">
      <div className="track-item__head">
        <span className="track-item__number">{track.track_number}</span>
        <span className="track-item__title">{track.title}</span>
        {editable ? (
          <span className="track-item__actions">
            <form action={moveTrack.bind(null, track.id, -1)}>
              <button type="submit" className="button button--quiet" disabled={isFirst}>
                <span aria-hidden="true">↑</span>
                <span className="visually-hidden">{`${t("editor.moveUp")}: ${track.title}`}</span>
              </button>
            </form>
            <form action={moveTrack.bind(null, track.id, 1)}>
              <button type="submit" className="button button--quiet" disabled={isLast}>
                <span aria-hidden="true">↓</span>
                <span className="visually-hidden">{`${t("editor.moveDown")}: ${track.title}`}</span>
              </button>
            </form>
          </span>
        ) : null}
      </div>

      {children}

      {editable ? (
        <details className="track-item__details">
          <summary>{`${t("editor.details")}: ${track.title}`}</summary>
          <form action={action} className="form-stack" noValidate>
            <FormMessage
              error={err(state.error)}
              saved={state.saved ? t("editor.saved") : undefined}
            />
            <InputField
              name="title"
              label={t("fields.title")}
              defaultValue={state.values?.title ?? track.title}
              error={err(state.fieldErrors?.title)}
              required
            />
            <InputField
              name="isrc"
              label={t("fields.isrc")}
              defaultValue={state.values?.isrc ?? track.isrc ?? ""}
              autoCapitalize="characters"
              error={err(state.fieldErrors?.isrc)}
            />
            <SelectField
              name="aiContent"
              label={t("fields.aiContent")}
              defaultValue={state.values?.aiContent ?? track.ai_content}
              options={AI_CONTENT.map((v) => ({ value: v, label: t(`ai.${v}`) }))}
            />
            <CheckboxField
              name="explicit"
              label={t("fields.explicit")}
              defaultChecked={state.values ? state.values.explicit === "on" : track.explicit}
            />
            <Submit variant="quiet">{t("editor.save")}</Submit>
          </form>

          <h4 className="track-item__subtitle">{t("editor.credits")}</h4>
          <ul className="artist-list">
            {track.credits.map((c) => (
              <li key={c.id} className="artist-list__item">
                <span className="artist-list__name">{c.name}</span>
                <span className="field__hint">
                  {t(`creditRoles.${c.role}`)}
                  {c.detail ? ` · ${c.detail}` : ""}
                </span>
                <form action={deleteCredit.bind(null, c.id)}>
                  <button type="submit" className="button button--quiet">
                    {t("editor.deleteCredit")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={creditAction} className="form-stack" noValidate>
            <InputField
              name="name"
              defaultValue={creditState.values?.name}
              label={t("fields.creditName")}
              error={err(creditState.fieldErrors?.name)}
              required
            />
            <SelectField
              name="role"
              label={t("fields.creditRole")}
              defaultValue={creditState.values?.role ?? "performer"}
              options={CREDIT_ROLES.map((v) => ({ value: v, label: t(`creditRoles.${v}`) }))}
            />
            <InputField
              name="detail"
              label={t("fields.creditDetail")}
              defaultValue={creditState.values?.detail}
            />
            <Submit variant="quiet">{t("editor.addCredit")}</Submit>
          </form>

          <form action={deleteTrack.bind(null, track.id)}>
            <button type="submit" className="button button--quiet button--danger">
              {`${t("editor.deleteTrack")}: ${track.title}`}
            </button>
          </form>
        </details>
      ) : null}
    </li>
  );
}

export function DeleteReleaseButton({
  releaseId,
  artistSlug,
}: {
  releaseId: string;
  artistSlug: string;
}) {
  const { t } = useText();
  return (
    <form action={deleteRelease.bind(null, releaseId, artistSlug)}>
      <button type="submit" className="button button--quiet button--danger">
        {t("editor.deleteDraft")}
      </button>
    </form>
  );
}
