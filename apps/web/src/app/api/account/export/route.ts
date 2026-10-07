import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GDPR art. 15/20: everything we hold about the signed-in person, as one JSON file.
// Read with the person's own session — RLS decides what is theirs, nothing more.

const PAGE = 1000;

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return new NextResponse(null, { status: 401 });

  const own = <T>(result: { data: T | null; error: unknown }) => {
    if (result.error) throw result.error;
    return result.data;
  };

  // Listening history can be long: read it page by page.
  const listening: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = own(
      await supabase
        .from("listening_events")
        .select(
          "track_id, release_id, artist_id, started_at, ms_played, completed, tier, soundcheck",
        )
        .order("started_at")
        .range(from, from + PAGE - 1),
    )!;
    listening.push(...page);
    if (page.length < PAGE) break;
  }

  const [
    profile,
    settings,
    roles,
    entitlements,
    redemptions,
    trackLikes,
    releaseLikes,
    follows,
    playlists,
    attendance,
    reports,
    memberships,
    userFollows,
    blocks,
    shares,
  ] = await Promise.all([
    supabase.from("profiles").select("handle, display_name, bio, created_at").eq("id", user.id),
    supabase.from("profile_settings").select("*").eq("user_id", user.id),
    supabase.from("user_roles").select("role, created_at").eq("user_id", user.id),
    supabase
      .from("entitlements")
      .select("plan_code, source, source_ref, starts_at, ends_at, revoked_at, revoked_reason")
      .eq("user_id", user.id),
    supabase
      .from("promo_redemptions")
      .select("campaign_id, redeemed_at, status")
      .eq("user_id", user.id),
    supabase.from("track_likes").select("track_id, created_at"),
    supabase.from("release_likes").select("release_id, created_at"),
    supabase.from("artist_follows").select("artist_id, created_at"),
    supabase
      .from("playlists")
      .select(
        "id, title, description, visibility, created_at, updated_at, items:playlist_tracks (track_id, position, added_at)",
      )
      .eq("owner_id", user.id),
    supabase.from("event_attendance").select("event_id, created_at"),
    supabase
      .from("reports")
      .select(
        "subject_type, subject_id, reason, details, claimant_name, claimant_email, status, created_at",
      )
      .eq("reporter_id", user.id),
    supabase
      .from("artist_members")
      .select("role, accepted_at, artist:artists (slug, name)")
      .eq("user_id", user.id),
    supabase
      .from("user_follows")
      .select("follower_id, followee_id, created_at")
      .or(`follower_id.eq.${user.id},followee_id.eq.${user.id}`),
    supabase.from("user_blocks").select("blocked_id, created_at"),
    supabase
      .from("listening_monthly_artist_shares")
      .select("month, artist_id, qualified_plays, ms_played"),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    },
    profile: own(profile)?.[0] ?? null,
    settings: own(settings)?.[0] ?? null,
    roles: own(roles),
    plans: own(entitlements),
    promo_redemptions: own(redemptions),
    likes: { tracks: own(trackLikes), releases: own(releaseLikes) },
    artist_follows: own(follows),
    playlists: own(playlists),
    listening_history: listening,
    attended_events: own(attendance),
    reports_sent: own(reports),
    artist_memberships: own(memberships),
    people_you_follow: own(userFollows)?.filter((f) => f.follower_id === user.id),
    people_following_you: own(userFollows)?.filter((f) => f.followee_id === user.id),
    blocked_people: own(blocks),
    monthly_listening_by_artist: own(shares),
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tunewick-dane-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
