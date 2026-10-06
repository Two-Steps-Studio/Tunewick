"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmAction } from "@/components/confirm-action";
import {
  type AddState,
  addToPlaylist,
  createPlaylist,
  type PlaylistFormState,
  updatePlaylist,
} from "../actions";

function Submit({ label, primary = true }: { label: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={primary ? "button button--primary" : "button"}
      disabled={pending}
      aria-busy={pending}
    >
      {label}
    </button>
  );
}

export function NewPlaylistForm() {
  const t = useTranslations("Playlists");
  const [state, action] = useActionState(createPlaylist, {} as PlaylistFormState);
  const id = useId();
  return (
    <form action={action} className="redeem-form" noValidate>
      <div className="field">
        <label htmlFor={id} className="field__label">
          {t("newTitle")}
        </label>
        <div className="redeem-form__row">
          <input
            id={id}
            name="title"
            maxLength={100}
            defaultValue={state.values?.title ?? ""}
            className="field__input"
            aria-invalid={state.error ? true : undefined}
          />
          <Submit label={t("create")} primary={false} />
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="field__error">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}

export function PlaylistEditForm({
  id,
  values,
}: {
  id: string;
  values: { title: string; description: string | null; visibility: string };
}) {
  const t = useTranslations("Playlists");
  const [state, action] = useActionState(updatePlaylist.bind(null, id), {} as PlaylistFormState);
  const current = state.values ?? { ...values, description: values.description ?? "" };
  const titleId = useId();
  const descriptionId = useId();
  const visibilityId = useId();
  return (
    <form action={action} className="form-stack promo-form" noValidate>
      {state.error ? (
        <p role="alert" className="form-error">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="form-status">
          {t("saved")}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor={titleId} className="field__label">
          {t("fields.title")}
        </label>
        <input
          id={titleId}
          name="title"
          maxLength={100}
          defaultValue={current.title}
          className="field__input"
        />
      </div>
      <div className="field">
        <label htmlFor={descriptionId} className="field__label">
          {t("fields.description")}
        </label>
        <textarea
          id={descriptionId}
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={current.description}
          className="field__input field__textarea"
        />
      </div>
      <div className="field">
        <label htmlFor={visibilityId} className="field__label">
          {t("fields.visibility")}
        </label>
        <select
          key={current.visibility}
          id={visibilityId}
          name="visibility"
          defaultValue={current.visibility}
          className="field__input"
          aria-describedby={`${visibilityId}-hint`}
        >
          <option value="private">{t("visibility.private")}</option>
          <option value="unlisted">{t("visibility.unlisted")}</option>
          <option value="public">{t("visibility.public")}</option>
        </select>
        <p id={`${visibilityId}-hint`} className="field__hint">
          {t("visibilityHint")}
        </p>
      </div>
      <Submit label={t("save")} />
    </form>
  );
}

/** "+" on a track row: pick one of your playlists. A disclosure, no animation (used often). */
export function AddToPlaylist({
  trackId,
  trackTitle,
  playlists,
}: {
  trackId: string;
  trackTitle: string;
  playlists: { id: string; title: string }[];
}) {
  const t = useTranslations("Playlists");
  const [state, action] = useActionState(addToPlaylist.bind(null, trackId), {} as AddState);
  const selectId = useId();
  const added = playlists.find((p) => p.id === state.playlist)?.title;
  return (
    <details
      className="add-to-playlist"
      onToggle={(event) => {
        const details = event.currentTarget;
        if (details.open) {
          details.querySelector(".add-to-playlist__panel")?.scrollIntoView({
            // Centre it: the last rows sit right above the fixed player bar.
            block: "center",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          });
        }
      }}
    >
      <summary className="player-button" aria-label={t("addTrack", { title: trackTitle })}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </summary>
      <div className="add-to-playlist__panel">
        {playlists.length === 0 ? (
          <p className="field__hint">{t("noPlaylists")}</p>
        ) : (
          <form action={action} className="add-to-playlist__form">
            <label htmlFor={selectId} className="field__label">
              {t("addTo")}
            </label>
            <select id={selectId} name="playlist" className="field__input">
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <Submit label={t("add")} />
          </form>
        )}
        {state.status === "added" ? (
          <p role="status" className="field__hint">
            {t("added", { playlist: added ?? "" })}
          </p>
        ) : state.status === "failed" ? (
          <p role="alert" className="field__error">
            {t("addFailed")}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/** Deleting cannot be undone: the first click asks, the second deletes. */
export function DeletePlaylistButton({ action }: { action: () => Promise<void> }) {
  const t = useTranslations("Playlists");
  return (
    <ConfirmAction
      action={action}
      label={t("delete")}
      question={t("deleteConfirm")}
      yes={t("deleteYes")}
      no={t("deleteNo")}
    />
  );
}
