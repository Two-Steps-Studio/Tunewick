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
  const { data } = await supabase
    .from("playlists")
    .select("id, title, visibility")
    .eq("id", id)
    .in("visibility", ["public", "unlisted"])
    .maybeSingle();
  return data ? { type: "playlist" as const, id, title: data.title } : null;
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

/** Staff see the subject even after it was taken down (RLS: staff read everything). */
async function describeForStaff(type: ReportSubject, id: string) {
  const supabase = await createSupabaseServerClient();
  if (type === "artist") {
    const { data } = await supabase
      .from("artists")
      .select("id, slug, name, status")
      .eq("id", id)
      .maybeSingle();
    return data
      ? { title: data.name, artistId: data.id, artistSlug: data.slug, releaseSlug: null }
      : null;
  }
  if (type === "release") {
    const { data } = await supabase
      .from("releases")
      .select("slug, title, artist:artists!releases_artist_id_fkey (id, slug, name)")
      .eq("id", id)
      .maybeSingle();
    return data?.artist
      ? {
          title: `${data.artist.name} — ${data.title}`,
          artistId: data.artist.id,
          artistSlug: data.artist.slug,
          releaseSlug: data.slug,
        }
      : null;
  }
  const { data } = await supabase.from("playlists").select("title").eq("id", id).maybeSingle();
  return data ? { title: data.title, artistId: null, artistSlug: null, releaseSlug: null } : null;
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

/** Decisions that affect an artist or a playlist owner (RLS: members / owner, staff). */
export async function getDecisions(filter: { artistId: string } | { playlistId: string }) {
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
    : query.eq("subject_type", "playlist").eq("subject_id", filter.playlistId));
  if (error) throw error;
  return data;
}
