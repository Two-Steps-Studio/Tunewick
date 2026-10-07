import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Releases waiting for review, oldest first (RLS: staff see every release). */
export async function getSubmissions() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .select(
      "id, title, type, submitted_at, artist:artists!releases_artist_id_fkey (slug, name, verification_status), tracks (count)",
    )
    .eq("status", "in_review")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** One submission with everything the moderator needs to decide. */
export async function getSubmission(releaseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: release } = await supabase
    .from("releases")
    .select(
      "id, slug, title, type, status, release_date, submitted_at, explicit, ai_content, territories, upc, p_line, c_line, artwork_image_id, artist:artists!releases_artist_id_fkey (id, slug, name, verification_status)",
    )
    .eq("id", releaseId)
    .maybeSingle();
  if (!release || !release.artist) return null;
  const [{ data: tracks }, { data: history }] = await Promise.all([
    supabase
      .from("tracks")
      .select(
        "id, disc_number, track_number, title, isrc, explicit, ai_content, credits (name, role, detail)",
      )
      .eq("release_id", releaseId)
      .order("disc_number")
      .order("track_number"),
    supabase
      .from("release_review_events")
      .select("kind, note, created_at")
      .eq("release_id", releaseId)
      .order("created_at"),
  ]);
  return { release, artist: release.artist, tracks: tracks ?? [], history: history ?? [] };
}

/** Open reports, oldest first, with a readable subject (RLS: staff see every report). */
export async function getOpenReports() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, subject_type, subject_id, category, details, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  const ids = (type: string) =>
    data.filter((r) => r.subject_type === type).map((r) => r.subject_id);
  const [tracks, releases, artists, users] = await Promise.all([
    supabase
      .from("tracks")
      .select(
        "id, title, public_code, release:releases(slug, artist:artists!releases_artist_id_fkey(slug, name))",
      )
      .in("id", ids("track")),
    supabase
      .from("releases")
      .select("id, slug, title, artist:artists!releases_artist_id_fkey(slug, name)")
      .in("id", ids("release")),
    supabase.from("artists").select("id, slug, name").in("id", ids("artist")),
    supabase.from("profiles").select("id, handle, display_name").in("id", ids("user")),
  ]);
  return data.map((report) => {
    switch (report.subject_type) {
      case "track": {
        const t = tracks.data?.find((x) => x.id === report.subject_id);
        return {
          ...report,
          label: t ? `${t.release?.artist?.name ?? ""} — ${t.title}` : null,
          artistSlug: t?.release?.artist?.slug ?? null,
          releaseSlug: t?.release?.slug ?? null,
          handle: null,
        };
      }
      case "release": {
        const r = releases.data?.find((x) => x.id === report.subject_id);
        return {
          ...report,
          label: r ? `${r.artist?.name ?? ""} — ${r.title}` : null,
          artistSlug: r?.artist?.slug ?? null,
          releaseSlug: r?.slug ?? null,
          handle: null,
        };
      }
      case "artist": {
        const a = artists.data?.find((x) => x.id === report.subject_id);
        return {
          ...report,
          label: a?.name ?? null,
          artistSlug: a?.slug ?? null,
          releaseSlug: null,
          handle: null,
        };
      }
      default: {
        const u = users.data?.find((x) => x.id === report.subject_id);
        return {
          ...report,
          label: u?.display_name ?? u?.handle ?? null,
          artistSlug: null,
          releaseSlug: null,
          handle: u?.handle ?? null,
        };
      }
    }
  });
}
