import "server-only";

import { cache } from "react";
import type { Database } from "@tunewick/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReleaseType = Database["public"]["Enums"]["release_type"];

export interface UpcomingRelease {
  id: string;
  slug: string;
  title: string;
  type: ReleaseType;
  publishAt: string;
  artworkImageId: string | null;
  artist: { id: string; slug: string; name: string; verified: boolean };
  /** How many listeners asked to be reminded. */
  reminders: number;
}

type Row = {
  id: string;
  slug: string;
  title: string;
  type: ReleaseType;
  publish_at: string;
  artwork_image_id: string | null;
  artist_id: string;
  artist_slug: string;
  artist_name: string;
  verified: boolean;
  reminders: number;
};

function fromRow(row: Row): UpcomingRelease {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    publishAt: row.publish_at,
    artworkImageId: row.artwork_image_id,
    artist: {
      id: row.artist_id,
      slug: row.artist_slug,
      name: row.artist_name,
      verified: row.verified,
    },
    reminders: row.reminders,
  };
}

/** A scheduled release by its slugs (the premiere page), or null when there is none. */
export const getUpcomingRelease = cache(async (artistSlug: string, releaseSlug: string) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upcoming_releases", {
    artist_slug: artistSlug,
    release_slug: releaseSlug,
  });
  if (error) throw error;
  return data?.[0] ? fromRow(data[0] as Row) : null;
});

/** An artist's scheduled releases, soonest first. */
export async function getArtistUpcoming(artistId: string): Promise<UpcomingRelease[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upcoming_releases", { artist: artistId });
  if (error) throw error;
  return (data ?? []).map((row) => fromRow(row as Row));
}

/** Whether the signed-in listener asked to be reminded (null for visitors). */
export async function getMyReminder(releaseId: string): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;
  const { data } = await supabase
    .from("release_reminders")
    .select("release_id")
    .eq("release_id", releaseId)
    .maybeSingle();
  return data !== null;
}
