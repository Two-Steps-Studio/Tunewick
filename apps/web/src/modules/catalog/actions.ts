"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ARTIST_TERMS_VERSION,
  creditSchema,
  fieldErrors,
  genresSchema,
  newReleaseSchema,
  releaseDbError,
  releaseDetailsSchema,
  type ReleaseFormState,
  rightsSchema,
  trackSchema,
} from "./validation";

function read(formData: FormData, names: string[]) {
  return Object.fromEntries(
    names.flatMap((n) => {
      const v = formData.get(n);
      return v === null ? [] : [[n, String(v)]];
    }),
  );
}

function refresh() {
  revalidatePath("/", "layout");
}

async function goToEditor(artistSlug: string, releaseSlug: string) {
  return redirect({
    href: {
      pathname: "/artists/[slug]/releases/[release]/edit",
      params: { slug: artistSlug, release: releaseSlug },
    },
    locale: await getLocale(),
  });
}

export async function createRelease(
  artist: { id: string; slug: string },
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const values = read(formData, ["title", "slug", "type"]);
  const parsed = newReleaseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("releases")
    .insert({ artist_id: artist.id, ...parsed.data });
  if (error) return { ...releaseDbError(error), values };
  return goToEditor(artist.slug, parsed.data.slug);
}

export async function updateRelease(
  target: { releaseId: string; artistSlug: string; slug: string },
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  // Submitted values come back on every error: React resets the form after an action, so the
  // fields would otherwise fall back to the saved values and silently drop what the user typed.
  const values = read(formData, [
    "title",
    "slug",
    "type",
    "releaseDate",
    "explicit",
    "aiContent",
    "territory",
    "upc",
    "pLine",
    "cLine",
  ]);
  const parsed = releaseDetailsSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .update({
      title: d.title,
      slug: d.slug,
      type: d.type,
      release_date: d.releaseDate,
      explicit: d.explicit,
      ai_content: d.aiContent,
      territories: [d.territory],
      upc: d.upc,
      p_line: d.pLine,
      c_line: d.cLine,
    })
    .eq("id", target.releaseId)
    .select("id");
  if (error) return { ...releaseDbError(error), values };
  // RLS filters releases that are no longer drafts.
  if (!data?.length) return { error: "notEditable", values };

  refresh();
  if (d.slug !== target.slug) return goToEditor(target.artistSlug, d.slug);
  return { saved: true };
}

export async function setGenres(
  releaseId: string,
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const chosen = formData.getAll("genre").map(String);
  // The chosen genres come back on errors so the form reset does not clear them.
  const values = { genres: chosen.join(",") };
  const parsed = genresSchema.safeParse(chosen);
  if (!parsed.success) return { error: "tooManyGenres", values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_release_genres", {
    release: releaseId,
    genre_ids: parsed.data,
  });
  if (error) return { ...releaseDbError(error), values };
  refresh();
  return { saved: true };
}

export async function addTrack(
  releaseId: string,
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const values = read(formData, ["title"]);
  const parsed = trackSchema.pick({ title: true }).safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_track", {
    release: releaseId,
    title: parsed.data.title,
  });
  if (error) return releaseDbError(error);
  refresh();
  return { saved: true };
}

export async function updateTrack(
  trackId: string,
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const values = read(formData, ["title", "isrc", "explicit", "aiContent"]);
  const parsed = trackSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tracks")
    .update({
      title: parsed.data.title,
      isrc: parsed.data.isrc,
      explicit: parsed.data.explicit,
      ai_content: parsed.data.aiContent,
    })
    .eq("id", trackId)
    .select("id");
  if (error) return { ...releaseDbError(error), values };
  if (!data?.length) return { error: "notEditable", values };
  refresh();
  return { saved: true };
}

export async function moveTrack(trackId: string, direction: -1 | 1): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("move_track", { track: trackId, direction });
  refresh();
}

export async function deleteTrack(trackId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("delete_track", { track: trackId });
  refresh();
}

export async function addCredit(
  trackId: string,
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const values = read(formData, ["name", "role", "detail", "artistSlug"]);
  const parsed = creditSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  const supabase = await createSupabaseServerClient();
  const { artistSlug, ...credit } = parsed.data;
  let artistId: string | null = null;
  if (artistSlug) {
    // Only active, public profiles can be linked; the link feeds related artists (M7).
    const { data: artist } = await supabase
      .from("artists")
      .select("id")
      .eq("slug", artistSlug)
      .eq("status", "active")
      .maybeSingle();
    if (!artist) return { fieldErrors: { artistSlug: "artistNotFound" }, values };
    artistId = artist.id;
  }
  const { error } = await supabase
    .from("credits")
    .insert({ track_id: trackId, ...credit, artist_id: artistId });
  if (error) return releaseDbError(error);
  refresh();
  return { saved: true };
}

export async function deleteCredit(creditId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.from("credits").delete().eq("id", creditId);
  refresh();
}

export async function deleteRelease(releaseId: string, artistSlug: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.from("releases").delete().eq("id", releaseId);
  refresh();
  redirect({
    href: { pathname: "/artists/[slug]/manage", params: { slug: artistSlug } },
    locale: await getLocale(),
  });
}

export async function declareRights(
  releaseId: string,
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const raw = {
    ownsMaster: formData.get("ownsMaster") ?? undefined,
    controlsComposition: formData.get("controlsComposition") ?? undefined,
    cmo: formData.getAll("cmo").map(String),
    samples: String(formData.get("samples") ?? "none"),
    samplesDescription: String(formData.get("samplesDescription") ?? ""),
    aiContent: String(formData.get("aiContent") ?? ""),
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  };
  // Echoed back on errors because React resets the form after an action.
  const values = {
    ownsMaster: raw.ownsMaster ? "on" : "",
    controlsComposition: raw.controlsComposition ? "on" : "",
    cmo: raw.cmo.join(","),
    samples: raw.samples,
    samplesDescription: raw.samplesDescription,
    aiContent: raw.aiContent,
    acceptTerms: raw.acceptTerms ? "on" : "",
  };
  const parsed = rightsSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values };
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  // Territories are taken from the release so the declaration matches what will be published.
  const { data: release } = await supabase
    .from("releases")
    .select("territories")
    .eq("id", releaseId)
    .maybeSingle();
  if (!release) return { error: "forbidden", values };

  const { error } = await supabase.from("rights_declarations").insert({
    release_id: releaseId,
    owns_master: true,
    controls_composition: d.controlsComposition,
    cmo_memberships: d.cmo,
    samples: d.samples,
    samples_description: d.samples === "cleared" ? d.samplesDescription : null,
    ai_content: d.aiContent,
    territories: release.territories,
    terms_version: ARTIST_TERMS_VERSION,
  });
  if (error) return { ...releaseDbError(error), values };
  refresh();
  return { saved: true };
}

export type SubmissionState = { error?: "not_ready" | "not_allowed" | "failed" };

/** Sends a ready release to moderation (the database re-checks readiness). */
export async function submitRelease(releaseId: string): Promise<SubmissionState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_release", { release: releaseId });
  refresh();
  if (!error) return {};
  return {
    error: error.code === "55000" ? "not_ready" : error.code === "42501" ? "not_allowed" : "failed",
  };
}

export async function withdrawSubmission(releaseId: string): Promise<SubmissionState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("withdraw_release_submission", { release: releaseId });
  refresh();
  return error ? { error: "failed" } : {};
}
