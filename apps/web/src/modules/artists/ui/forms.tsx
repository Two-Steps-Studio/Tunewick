"use client";

import { VOIVODESHIPS } from "@tunewick/shared";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  FormMessage,
  InputField,
  SelectField,
  Submit,
  TextareaField,
} from "@/components/form/field";
import {
  acceptMembership,
  createArtist,
  inviteMember,
  removeMember,
  requestVerification,
  updateArtist,
  updateArtistReach,
} from "../actions";
import { type ArtistFormState, slugify } from "../validation";

const initial: ArtistFormState = {};

function useErrors() {
  const t = useTranslations("Artists.errors");
  return (code?: string) => (code ? t(code as Parameters<typeof t>[0]) : undefined);
}

export function CreateArtistForm() {
  const t = useTranslations("Artists");
  const err = useErrors();
  const [state, action] = useActionState(createArtist, initial);
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={action} className="auth-form" noValidate>
      <FormMessage error={err(state.error)} />
      <InputField
        name="name"
        label={t("fields.name")}
        defaultValue={state.values?.name}
        error={err(state.fieldErrors?.name)}
        required
        onChange={(e) => {
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
      />
      <InputField
        name="slug"
        label={t("fields.slug")}
        hint={t("hints.slug")}
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value);
        }}
        autoCapitalize="none"
        spellCheck={false}
        error={err(state.fieldErrors?.slug)}
        required
      />
      <Submit>{t("create.submit")}</Submit>
    </form>
  );
}

export function ArtistInfoForm({
  artistId,
  values,
}: {
  artistId: string;
  values: {
    name: string;
    bio: string | null;
    formedYear: number | null;
    voivodeship: string | null;
    city: string | null;
  };
}) {
  const t = useTranslations("Artists");
  const tPlaces = useTranslations("Places");
  const err = useErrors();
  const [state, action] = useActionState(updateArtist.bind(null, artistId), initial);
  return (
    <form action={action} className="form-stack">
      <FormMessage error={err(state.error)} saved={state.saved ? t("manage.saved") : undefined} />
      <InputField
        name="name"
        label={t("fields.name")}
        defaultValue={state.values?.name ?? values.name}
        error={err(state.fieldErrors?.name)}
        required
      />
      <TextareaField
        name="bio"
        label={t("fields.bio")}
        defaultValue={state.values?.bio ?? values.bio ?? ""}
        error={err(state.fieldErrors?.bio)}
      />
      <InputField
        name="formedYear"
        label={t("fields.formedYear")}
        inputMode="numeric"
        defaultValue={state.values?.formedYear ?? values.formedYear?.toString() ?? ""}
        error={err(state.fieldErrors?.formedYear)}
      />
      <InputField
        name="city"
        label={t("fields.city")}
        hint={t("hints.city")}
        autoComplete="address-level2"
        defaultValue={state.values?.city ?? values.city ?? ""}
        error={err(state.fieldErrors?.city)}
      />
      <SelectField
        name="voivodeship"
        label={t("fields.voivodeship")}
        defaultValue={state.values?.voivodeship ?? values.voivodeship ?? ""}
        error={err(state.fieldErrors?.voivodeship)}
        options={[
          { value: "", label: t("fields.voivodeshipNone") },
          ...VOIVODESHIPS.map((v) => ({ value: v, label: tPlaces(`voivodeship.${v}`) })),
        ]}
      />
      <Submit>{t("manage.save")}</Submit>
    </form>
  );
}

/** Where the artist is from and what they make — what the Discover feed and filters use. */
export function ArtistReachForm({
  artistId,
  values,
  countries,
  genres,
}: {
  artistId: string;
  values: {
    country: string | null;
    region: string | null;
    languages: string[];
    genres: number[];
    links: string[];
  };
  countries: { code: string; name: string }[];
  genres: { id: number; name: string }[];
}) {
  const t = useTranslations("Artists");
  const err = useErrors();
  const [state, action] = useActionState(updateArtistReach.bind(null, artistId), initial);
  return (
    <form action={action} className="form-stack">
      <FormMessage error={err(state.error)} saved={state.saved ? t("manage.saved") : undefined} />
      <SelectField
        name="country"
        label={t("fields.country")}
        hint={t("hints.country")}
        defaultValue={state.values?.country ?? values.country ?? ""}
        error={err(state.fieldErrors?.country)}
        options={[
          { value: "", label: t("fields.countryNone") },
          ...countries.map((c) => ({ value: c.code, label: c.name })),
        ]}
      />
      <InputField
        name="region"
        label={t("fields.region")}
        hint={t("hints.region")}
        autoComplete="address-level1"
        defaultValue={state.values?.region ?? values.region ?? ""}
        error={err(state.fieldErrors?.region)}
      />
      <InputField
        name="languages"
        label={t("fields.languages")}
        hint={t("hints.languages")}
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state.values?.languages ?? values.languages.join(", ")}
        error={err(state.fieldErrors?.languages)}
      />
      <fieldset className="field">
        <legend className="field__label">{t("fields.genres")}</legend>
        <p className="field__hint">{t("hints.genres")}</p>
        <div className="chip-row">
          {genres.map((g) => (
            <label key={g.id} className="chip">
              <input
                type="checkbox"
                name="genres"
                value={g.id}
                defaultChecked={values.genres.includes(g.id)}
              />
              <span>{g.name}</span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.genres ? (
          <p className="field__error">{err(state.fieldErrors.genres)}</p>
        ) : null}
      </fieldset>
      <TextareaField
        name="links"
        label={t("fields.links")}
        hint={t("hints.links")}
        defaultValue={state.values?.links ?? values.links.join("\n")}
        error={err(state.fieldErrors?.links)}
      />
      <Submit>{t("manage.save")}</Submit>
    </form>
  );
}

export function InviteMemberForm({ artistId }: { artistId: string }) {
  const t = useTranslations("Artists");
  const err = useErrors();
  const [state, action] = useActionState(inviteMember.bind(null, artistId), initial);
  return (
    <form action={action} className="form-stack">
      <FormMessage error={err(state.error)} />
      <InputField
        name="handle"
        label={t("fields.handle")}
        hint={t("hints.handle")}
        autoCapitalize="none"
        spellCheck={false}
        defaultValue={state.saved ? "" : state.values?.handle}
        key={state.saved ? "reset" : "keep"}
        error={err(state.fieldErrors?.handle)}
        required
      />
      <SelectField
        name="role"
        label={t("fields.role")}
        defaultValue="member"
        options={(["member", "manager", "owner"] as const).map((r) => ({
          value: r,
          label: t(`roles.${r}`),
        }))}
      />
      <Submit variant="quiet">{t("manage.invite")}</Submit>
    </form>
  );
}

export function RemoveMemberButton({
  artistId,
  memberId,
  label,
}: {
  artistId: string;
  memberId: string;
  label: string;
}) {
  const err = useErrors();
  const [state, action] = useActionState(removeMember.bind(null, artistId, memberId), initial);
  return (
    <form action={action} className="artist-member__remove">
      <Submit variant="quiet">{label}</Submit>
      <FormMessage error={err(state.error)} />
    </form>
  );
}

export function VerificationForm({ artistId }: { artistId: string }) {
  const t = useTranslations("Artists");
  const err = useErrors();
  const [state, action] = useActionState(requestVerification.bind(null, artistId), initial);
  return (
    <form action={action} className="form-stack">
      <FormMessage error={err(state.error)} saved={state.saved ? t("manage.saved") : undefined} />
      <TextareaField
        name="evidence"
        label={t("fields.evidence")}
        hint={t("hints.evidence")}
        defaultValue={state.values?.evidence}
        error={err(state.fieldErrors?.evidence)}
        required
      />
      <TextareaField
        name="note"
        label={t("fields.note")}
        rows={3}
        defaultValue={state.values?.note}
        error={err(state.fieldErrors?.note)}
      />
      <Submit>{t("manage.requestVerification")}</Submit>
    </form>
  );
}

export function AcceptInviteButton({ artistId }: { artistId: string }) {
  const t = useTranslations("Artists.my");
  return (
    <form action={acceptMembership.bind(null, artistId)}>
      <Submit>{t("accept")}</Submit>
    </form>
  );
}
