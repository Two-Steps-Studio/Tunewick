"use server";

import { isVoivodeship } from "@tunewick/shared";
import { refresh, revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventFormError =
  "title" | "date" | "venue" | "ticket" | "lineup" | "limit" | "forbidden" | "failed";

export interface EventFormState {
  error?: EventFormError;
  saved?: boolean;
  values?: Record<string, string>;
}

const FIELDS = [
  "title",
  "startsAt",
  "venueName",
  "city",
  "voivodeship",
  "address",
  "ticketUrl",
  "lineup",
  "description",
];

/** Adds a gig for the artist: finds or creates the venue, resolves the lineup by profile address. */
export async function createEvent(
  artistId: string,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const values = Object.fromEntries(
    FIELDS.map((n) => [n, String(formData.get(n) ?? "").trim()]),
  ) as Record<string, string>;
  if (values.title!.length < 2 || values.title!.length > 160) return { error: "title", values };
  // datetime-local is wall-clock time in Poland; Postgres applies the right offset (DST).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.startsAt!)) return { error: "date", values };
  if (
    values.venueName!.length < 2 ||
    values.city!.length < 2 ||
    !isVoivodeship(values.voivodeship!)
  ) {
    return { error: "venue", values };
  }
  if (values.ticketUrl && !/^https:\/\/\S+$/.test(values.ticketUrl)) {
    return { error: "ticket", values };
  }

  const supabase = await createSupabaseServerClient();
  const slugs = values
    .lineup!.split(/[\s,]+/)
    .map((s) => s.toLowerCase())
    .filter(Boolean);
  let lineup: string[] = [];
  if (slugs.length) {
    const { data } = await supabase
      .from("artists")
      .select("id, slug")
      .in("slug", slugs)
      .eq("status", "active");
    if ((data ?? []).length !== new Set(slugs).size) return { error: "lineup", values };
    lineup = slugs.map((s) => data!.find((a) => a.slug === s)!.id);
  }

  const venue = await supabase.rpc("find_or_create_venue", {
    name: values.venueName!,
    city: values.city!,
    voivodeship: values.voivodeship as never,
    address: values.address || undefined,
  });
  if (venue.error) return { error: "venue", values };
  const { error } = await supabase.rpc("create_event", {
    artist: artistId,
    title: values.title!,
    venue: venue.data,
    starts_at: `${values.startsAt!.replace("T", " ")} Europe/Warsaw`,
    lineup,
    ticket_url: values.ticketUrl || undefined,
    description: values.description || undefined,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden", values };
    if (error.code === "54000") return { error: "limit", values };
    if (error.code === "22023") return { error: "date", values };
    return { error: "failed", values };
  }
  refresh();
  return { saved: true };
}

export async function cancelEvent(eventId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_event", { event: eventId });
  if (error) throw error;
  revalidatePath("/", "layout");
}

export interface ReviewEventState {
  error?: "note_required" | "mfa_required" | "not_allowed" | "decided" | "failed";
  note?: string;
}

export async function reviewEvent(
  eventId: string,
  _prev: ReviewEventState,
  formData: FormData,
): Promise<ReviewEventState> {
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (decision === "reject" && note.length < 10) return { error: "note_required", note };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_event", {
    event: eventId,
    decision,
    note: note || undefined,
  });
  if (error) {
    if (error.hint === "mfa_required") return { error: "mfa_required", note };
    if (error.code === "42501") return { error: "not_allowed", note };
    if (error.code === "55000") return { error: "decided", note };
    if (error.code === "22023") return { error: "note_required", note };
    return { error: "failed", note };
  }
  revalidatePath("/", "layout");
  return {};
}

/** "I was there" on or off; the database enforces the time window. */
export async function setAttended(eventId: string, on: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = on
    ? await supabase.rpc("mark_attended", { event: eventId })
    : await supabase.from("event_attendance").delete().eq("event_id", eventId);
  if (error) {
    return {
      ok: false as const,
      on: !on,
      reason: (error.hint === "not_started" || error.hint === "too_late"
        ? error.hint
        : "failed") as "not_started" | "too_late" | "failed",
    };
  }
  revalidatePath("/", "layout");
  return { ok: true as const, on };
}
