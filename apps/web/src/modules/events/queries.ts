import "server-only";

import type { Database } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Voivodeship = Database["public"]["Enums"]["voivodeship"];
export type EventStatus = Database["public"]["Enums"]["event_status"];
export interface LineupArtist {
  slug: string;
  name: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Upcoming public events (published or cancelled), soonest first. */
export async function getUpcomingEvents(region: Voivodeship | null, max = 30) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "upcoming_events",
    region ? { region, max_results: max } : { max_results: max },
  );
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, lineup: e.lineup as unknown as LineupArtist[] }));
}

/** One event the caller may see, with its venue and lineup (artists with their images). */
export async function getEvent(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, status, ticket_url, artist_id, review_note, venue:venues (slug, name, city, voivodeship, address, website, verified)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!event?.venue) return null;
  const { data: lineup, error: lineupError } = await supabase
    .from("event_lineup")
    .select("position, artist:artists (id, slug, name, image_id, verification_status)")
    .eq("event_id", id)
    .order("position");
  if (lineupError) throw lineupError;
  return {
    event: { ...event, venue: event.venue },
    lineup: lineup.flatMap((l) => (l.artist ? [l.artist] : [])),
  };
}

/** A venue with its upcoming and past public events. */
export async function getVenue(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data: venue, error } = await supabase
    .from("venues")
    .select("id, slug, name, city, voivodeship, address, website, verified")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!venue) return null;
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, starts_at, status")
    .eq("venue_id", venue.id)
    .in("status", ["published", "cancelled"])
    .order("starts_at", { ascending: false })
    .limit(100);
  if (eventsError) throw eventsError;
  const now = Date.now();
  return {
    venue,
    upcoming: events.filter((e) => Date.parse(e.starts_at) >= now - 6 * 3600_000).reverse(),
    past: events.filter((e) => Date.parse(e.starts_at) < now - 6 * 3600_000),
  };
}

/** Public events an artist plays (lineup), upcoming first. */
export async function getArtistEvents(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_lineup")
    .select("event:events (id, title, starts_at, status, venue:venues (name, city))")
    .eq("artist_id", artistId);
  if (error) throw error;
  const now = Date.now() - 6 * 3600_000;
  return data
    .flatMap((row) =>
      row.event?.venue && (row.event.status === "published" || row.event.status === "cancelled")
        ? [{ ...row.event, venue: row.event.venue }]
        : [],
    )
    .filter((e) => Date.parse(e.starts_at) >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Every event the artist added (any status) — the manage page. */
export async function getManagedEvents(artistId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at, status, review_note, venue:venues (name, city)")
    .eq("artist_id", artistId)
    .order("starts_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

/** Events waiting for a moderator, soonest first. */
export async function getPendingEvents() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, starts_at, ticket_url, description, artist:artists!events_artist_id_fkey (slug, name, verification_status), venue:venues (name, city, verified)",
    )
    .eq("status", "pending")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** The newest public release of each artist (for lineup soundchecks). */
export async function getNewestReleases(artistIds: string[]) {
  if (!artistIds.length) return new Map<string, string>();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .select("id, artist_id, publish_at")
    .in("artist_id", artistIds)
    .eq("status", "published")
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: false });
  if (error) throw error;
  const newest = new Map<string, string>();
  for (const r of data) if (!newest.has(r.artist_id)) newest.set(r.artist_id, r.id);
  return newest;
}

/** Whether the signed-in listener marked "I was there" (null when signed out). */
export async function getAttended(eventId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const { data, error } = await supabase
    .from("event_attendance")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** The listener's gig history: events they marked, newest first. */
export async function getMyAttendedEvents() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_attendance")
    .select("event:events (id, title, starts_at, status, venue:venues (name, city))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data
    .flatMap((row) => (row.event?.venue ? [{ ...row.event, venue: row.event.venue }] : []))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
}
