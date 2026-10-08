"use client";

import { previewWindow } from "@tunewick/shared";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage, InputField, SelectField, Submit } from "@/components/form/field";
import { setTrackPreview } from "../actions";
import { formatClock, PREVIEW_LENGTHS, type ReleaseFormState } from "../validation";

const initial: ReleaseFormState = {};

/**
 * The part of a track the Discover feed plays. Empty start = automatic (about a third in). Can be
 * changed after publishing: it picks an excerpt, it does not change the music.
 */
export function PreviewForm({
  track,
}: {
  track: {
    id: string;
    title: string;
    duration_ms: number | null;
    soundcheck_start_ms: number | null;
    soundcheck_duration_ms: number | null;
  };
}) {
  const t = useTranslations("Releases");
  const tErr = useTranslations("Releases.errors");
  const [state, action] = useActionState(
    setTrackPreview.bind(null, track.id, track.duration_ms),
    initial,
  );
  const chosen = track.soundcheck_start_ms !== null && track.soundcheck_duration_ms !== null;
  const automatic = previewWindow(track.duration_ms, null, null);
  return (
    <details className="track-item__details">
      <summary>{`${t("preview.title")}: ${track.title}`}</summary>
      <form action={action} className="form-stack" noValidate>
        <p className="field__hint">
          {chosen
            ? t("preview.chosen", {
                start: formatClock(track.soundcheck_start_ms!),
                length: Math.round(track.soundcheck_duration_ms! / 1000),
              })
            : t("preview.automatic", {
                start: formatClock(automatic.startMs),
                length: Math.round(automatic.lengthMs / 1000),
              })}
        </p>
        <FormMessage
          error={state.error ? tErr(state.error) : undefined}
          saved={state.saved ? t("editor.saved") : undefined}
        />
        <InputField
          name="start"
          label={t("preview.start")}
          hint={t("preview.startHint")}
          inputMode="numeric"
          placeholder="1:05"
          defaultValue={
            state.values?.start ?? (chosen ? formatClock(track.soundcheck_start_ms!) : "")
          }
          error={state.fieldErrors?.start ? tErr(state.fieldErrors.start) : undefined}
        />
        <SelectField
          name="length"
          label={t("preview.length")}
          defaultValue={
            state.values?.length ??
            String(chosen ? Math.round(track.soundcheck_duration_ms! / 1000) : 30)
          }
          options={PREVIEW_LENGTHS.map((s) => ({
            value: String(s),
            label: t("preview.seconds", { s }),
          }))}
        />
        <Submit variant="quiet">{t("editor.save")}</Submit>
      </form>
    </details>
  );
}
