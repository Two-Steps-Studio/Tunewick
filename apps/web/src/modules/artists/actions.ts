"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  artistDbError,
  type ArtistFormState,
  createArtistSchema,
  inviteSchema,
  updateArtistSchema,
  verificationSchema,
} from "./validation";

function fields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "")]));
}

function firstErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const result: Record<string, ArtistFormState["error"]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !result[key]) result[key] = issue.message as ArtistFormState["error"];
  }
  return result;
}

function failure(error: { code?: string; message?: string }, values?: Record<string, string>) {
  const mapped = artistDbError(error);
  return mapped.field
    ? { fieldErrors: { [mapped.field]: mapped.code }, values }
    : { error: mapped.code, values };
}

export async function createArtist(
  _prev: ArtistFormState,
  formData: FormData,
): Promise<ArtistFormState> {
  const values = fields(formData, ["name", "slug"]);
  const parsed = createArtistSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error.issues), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_artist", parsed.data);
  if (error) return failure(error, values);

  return redirect({
    href: { pathname: "/artists/[slug]/manage", params: { slug: parsed.data.slug } },
    locale: await getLocale(),
  });
}

export async function updateArtist(
  artistId: string,
  _prev: ArtistFormState,
  formData: FormData,
): Promise<ArtistFormState> {
  const values = fields(formData, ["name", "bio", "formedYear", "voivodeship", "city"]);
  const parsed = updateArtistSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error.issues), values };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("artists")
    .update({
      name: parsed.data.name,
      bio: parsed.data.bio,
      formed_year: parsed.data.formedYear,
      voivodeship: parsed.data.voivodeship,
      city: parsed.data.city,
    })
    .eq("id", artistId)
    .select("id");
  if (error) return failure(error, values);
  // RLS silently filters rows the user may not edit.
  if (!data?.length) return { error: "forbidden", values };
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function inviteMember(
  artistId: string,
  _prev: ArtistFormState,
  formData: FormData,
): Promise<ArtistFormState> {
  const values = fields(formData, ["handle", "role"]);
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error.issues), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("invite_artist_member", {
    artist: artistId,
    handle: parsed.data.handle,
    role: parsed.data.role,
  });
  if (error) return failure(error, values);
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function acceptMembership(artistId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("accept_artist_membership", { artist: artistId });
  revalidatePath("/", "layout");
}

export async function removeMember(artistId: string, memberId: string): Promise<ArtistFormState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_artist_member", {
    artist: artistId,
    member: memberId,
  });
  if (error) return failure(error);
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function requestVerification(
  artistId: string,
  _prev: ArtistFormState,
  formData: FormData,
): Promise<ArtistFormState> {
  const values = fields(formData, ["evidence", "note"]);
  const parsed = verificationSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error.issues), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_artist_verification", {
    artist: artistId,
    evidence: parsed.data.evidence,
    note: parsed.data.note ?? undefined,
  });
  if (error) return failure(error, values);
  revalidatePath("/", "layout");
  return { saved: true };
}
