import "server-only";

import { headers } from "next/headers";
import type { Locale } from "@/i18n/routing";
import { isMediaStorageConfigured, presignVariantGet, putIngestObject } from "@/lib/media/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSharedSong } from "./song";
import { renderSongCard } from "./song-card";

/** Bump when the story card or the clip layout changes: new clips instead of old ones. */
export const CLIP_DESIGN = 1;

export type ClipState =
  | { state: "working"; id: string }
  | { state: "ready"; id: string; url: string }
  | { state: "failed" | "unavailable" | "signin" | "limit" };

/** The address people see on the card: the one this request came to. */
async function requestOrigin() {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function stateOf(id: string, fileName: string): Promise<ClipState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("share_clip", { clip: id });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return { state: "unavailable" };
  if (row.status === "failed") return { state: "failed" };
  if (row.status === "ready" && row.object_key) {
    const url = await presignVariantGet(row.object_key, fileName);
    return url ? { state: "ready", id, url } : { state: "unavailable" };
  }
  return { state: "working", id };
}

const fileName = (code: string) => `tunewick-${code}.mp4`;

/**
 * Finds or starts the video clip of a public song's preview (its share card + the preview audio),
 * rendering and storing the card when the clip still needs it.
 */
export async function startClip(code: string, locale: Locale): Promise<ClipState> {
  if (!isMediaStorageConfigured()) return { state: "unavailable" };
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { state: "signin" };
  const song = await getSharedSong(code, 320);
  if (!song || !song.preview.sources.length) return { state: "unavailable" };

  const { data, error } = await supabase.rpc("request_share_clip", {
    track: song.track.id,
    locale,
    start_ms: song.preview.startMs,
    duration_ms: song.preview.lengthMs,
    design: CLIP_DESIGN,
  });
  if (error) {
    if (error.code === "54000") return { state: "limit" };
    if (error.code === "42501" || error.code === "22023") return { state: "unavailable" };
    throw error;
  }
  const clip = data?.[0];
  if (!clip) return { state: "unavailable" };
  if (clip.needs_card) {
    const card = await renderSongCard(code, "story", locale, await requestOrigin());
    if (!card) return { state: "unavailable" };
    await putIngestObject(clip.card_key, await card.arrayBuffer(), "image/png");
    const queued = await supabase.rpc("queue_share_clip", { clip: clip.id });
    if (queued.error) throw queued.error;
  }
  return stateOf(clip.id, fileName(code));
}

/** Where a clip stands (polled by the share menu while the worker renders it). */
export async function clipState(id: string, code: string): Promise<ClipState> {
  return stateOf(id, fileName(code));
}
