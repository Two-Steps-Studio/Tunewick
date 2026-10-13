"use client";

import { useSyncExternalStore } from "react";
import { IDLE_STATE, PlayerEngine } from "./engine/engine";
import { type ListenAwards, reportAwards } from "@/modules/notices";
import { ListeningTracker } from "./listening";
import { browserFamily, PlaybackMetrics } from "./metrics";
import type { PlayerState, PlayerTrack } from "./types";

let engine: PlayerEngine | null = null;

/** The one engine of this tab (client only). It lives outside React, so navigation never stops playback. */
export function getPlayer(): PlayerEngine {
  if (!engine) {
    engine = new PlayerEngine();
    engine.setAutoplaySource(fetchAutoplay);
  }
  return engine;
}

/** Songs like the seed from /api/autoplay (signed URLs, so never cached). */
async function fetchAutoplay(trackId: string, exclude: string[]): Promise<PlayerTrack[]> {
  const response = await fetch("/api/autoplay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId, exclude: exclude.slice(-500) }),
  });
  if (!response.ok) return [];
  return ((await response.json()) as { tracks: PlayerTrack[] }).tracks;
}

const subscribe = (listener: () => void) => getPlayer().subscribe(listener);
const getSnapshot = () => getPlayer().getState();
const getServerSnapshot = () => IDLE_STATE;

export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

let reporting = false;

/**
 * Sends listens of this tab to the server (signed-in listeners only - the server checks again)
 * and shows what they earned, plus playback telemetry. keepalive lets the last listen leave even
 * while the page is closing.
 */
export function startListeningReports() {
  if (reporting || typeof window === "undefined") return;
  reporting = true;
  const tracker = new ListeningTracker((listen) => {
    void fetch("/api/listen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listen),
      keepalive: true,
    })
      .then(async (response) => (response.ok ? ((await response.json()) as ListenAwards) : null))
      .then(reportAwards)
      .catch(() => undefined);
  });
  const browser = browserFamily(navigator.userAgent);
  const metrics = new PlaybackMetrics((metric) => {
    void fetch("/api/playback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metric, browser }),
      keepalive: true,
    }).catch(() => undefined);
  });
  const player = getPlayer();
  player.subscribe(() => {
    const state = player.getState();
    tracker.update(state);
    metrics.update(state);
  });
  window.addEventListener("pagehide", () => tracker.flush());
}
