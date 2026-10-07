import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type ModerationAction, REPORT_SUBJECTS, type ReportSubject } from "./constants";

export type { ModerationAction };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a report is about, for the form heading and links (public content only). */
export async function getReportSubject(type: string, id: string) {
  if (!REPORT_SUBJECTS.includes(type as ReportSubject) || !UUID.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  if (type === "artist") {
    const { data } = await supabase
      .from("artists")
      .select("id, slug, name")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    return data ? { type: "artist" as const, id, title: data.name, artistSlug: data.slug } : null;
  }
  if (type === "release") {
    const { data } = await supabase
      .from("releases")
      .select("id, slug, title, status, artist:artists!releases_artist_id_fkey (slug, name)")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    return data?.artist
      ? {
          type: "release" as const,
          id,
          title: `${data.artist.name} — ${data.title}`,
          artistSlug: data.artist.slug,
          releaseSlug: data.slug,
        }
      : null;
  }
  if (type === "playlist") {
    const { data } = await supabase
      .from("playlists")
      .select("id, title, visibility")
      .eq("id", id)
      .in("visibility", ["public", "unlisted"])
      .maybeSingle();
    return data ? { type: "playlist" as const, id, title: data.title } : null;
  }
  if (type === "event") {
    // RLS shows published and cancelled events to everyone; pending ones only to their artist.
    const { data } = await supabase
      .from("events")
      .select("id, title, status")
      .eq("id", id)
      .in("status", ["published", "cancelled"])
      .maybeSingle();
    return data ? { type: "event" as const, id, title: data.title } : null;
  }
  if (type === "venue") {
    const { data } = await supabase
      .from("venues")
      .select("id, name, city")
      .eq("id", id)
      .maybeSingle();
    return data ? { type: "venue" as const, id, title: `${data.name}, ${data.city}` } : null;
  }
  const { data } = await supabase
    .from("profiles")
    .select("id, handle, display_name")
    .eq("id", id)
    .not("handle", "is", null)
    .maybeSingle();
  return data?.handle
    ? { type: "profile" as const, id, title: data.display_name ?? `@${data.handle}` }
    : null;
}

/** Open reports, grouped by subject (oldest first), with what moderators need to decide. */
export async function getOpenReports() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, subject_type, subject_id, reason, details, claimant_name, claimant_email, created_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const groups = new Map<string, { first: (typeof data)[number]; all: typeof data }>();
  for (const report of data) {
    const key = `${report.subject_type}:${report.subject_id}`;
    const group = groups.get(key);
    if (group) group.all.push(report);
    else groups.set(key, { first: report, all: [report] });
  }
  return Promise.all(
    [...groups.values()].map(async ({ first, all }) => {
      const subject = await describeForStaff(first.subject_type, first.subject_id);
      const strikes = subject?.artistId
        ? ((await supabase.rpc("artist_copyright_strikes", { artist: subject.artistId })).data ?? 0)
        : 0;
      return { report: first, reports: all, subject, strikes };
    }),
  );
}

/** Where a subject lives, for links in the moderation queue (null: no page to link to). */
export type SubjectHref =
  | { pathname: "/artists/[slug]"; params: { slug: string } }
  | { pathname: "/artists/[slug]/releases/[release]"; params: { slug: string; release: string } }
  | { pathname: "/playlists/[id]"; params: { id: string } }
  | { pathname: "/events/[id]"; params: { id: string } }
  | { pathname: "/venues/[slug]"; params: { slug: string } }
  | { pathname: "/profile/[handle]"; params: { handle: string } };

interface StaffSubject {
  title: string;
  artistId: string | null;
  href: SubjectHref | null;
}

/** Staff see the subject even after it was taken down (RLS: staff read everything). */
async function describeForStaff(type: ReportSubject, id: string): Promise<StaffSubject | null> {
  const supabase = await createSupabaseServerClient();
  switch (type) {
    case "artist": {
      const { data } = await supabase
        .from("artists")
        .select("id, slug, name")
        .eq("id", id)
        .maybeSingle();
      return data
        ? {
            title: data.name,
            artistId: data.id,
            href: { pathname: "/artists/[slug]", params: { slug: data.slug } },
          }
        : null;
    }
    case "release": {
      const { data } = await supabase
        .from("releases")
        .select("slug, title, artist:artists!releases_artist_id_fkey (id, slug, name)")
        .eq("id", id)
        .maybeSingle();
      return data?.artist
        ? {
            title: `${data.artist.name} — ${data.title}`,
            artistId: data.artist.id,
            href: {
              pathname: "/artists/[slug]/releases/[release]",
              params: { slug: data.artist.slug, release: data.slug },
            },
          }
        : null;
    }
    case "playlist": {
      const { data } = await supabase.from("playlists").select("title").eq("id", id).maybeSingle();
      return data
        ? {
            title: data.title,
            artistId: null,
            href: { pathname: "/playlists/[id]", params: { id } },
          }
        : null;
    }
    case "event": {
      const { data } = await supabase
        .from("events")
        .select("title, artist_id")
        .eq("id", id)
        .maybeSingle();
      return data
        ? {
            title: data.title,
            artistId: data.artist_id,
            href: { pathname: "/events/[id]", params: { id } },
          }
        : null;
    }
    case "venue": {
      const { data } = await supabase
        .from("venues")
        .select("slug, name, city")
        .eq("id", id)
        .maybeSingle();
      return data
        ? {
            title: `${data.name}, ${data.city}`,
            artistId: null,
            href: { pathname: "/venues/[slug]", params: { slug: data.slug } },
          }
        : null;
    }
    case "profile": {
      const { data } = await supabase
        .from("profiles")
        .select("handle, display_name")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        title: data.display_name ?? (data.handle ? `@${data.handle}` : "—"),
        artistId: null,
        href: data.handle
          ? { pathname: "/profile/[handle]", params: { handle: data.handle } }
          : null,
      };
    }
  }
}

/** Appeals waiting for a (different) moderator. */
export async function getPendingAppeals() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("moderation_decisions")
    .select(
      "id, subject_type, subject_id, action, reason, statement, decided_by, decided_at, appeal_text, appealed_at",
    )
    .eq("appeal_status", "pending")
    .order("appealed_at", { ascending: true });
  if (error) throw error;
  return Promise.all(
    data.map(async (d) => ({
      ...d,
      subject: await describeForStaff(d.subject_type, d.subject_id),
    })),
  );
}

/** Decisions that affect an artist, a playlist owner or a person (RLS: members / owner, staff). */
export type DecisionFilter = { artistId: string } | { playlistId: string } | { ownerId: string };

export async function getDecisions(filter: DecisionFilter) {
  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from("moderation_decisions")
    .select(
      "id, subject_type, subject_id, action, reason, statement, decided_at, appeal_status, appeal_text, appeal_note",
    )
    .neq("action", "dismiss")
    .order("decided_at", { ascending: false });
  const { data, error } = await ("artistId" in filter
    ? query.eq("artist_id", filter.artistId)
    : "playlistId" in filter
      ? query.eq("subject_type", "playlist").eq("subject_id", filter.playlistId)
      : // A person's own profile and the venues they added (playlists have their own page).
        query.eq("owner_id", filter.ownerId).in("subject_type", ["profile", "venue"]));
  if (error) throw error;
  return data;
}
