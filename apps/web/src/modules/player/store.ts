"use client";

import { useSyncExternalStore } from "react";
import { IDLE_STATE, PlayerEngine } from "./engine/engine";
import { type ListenAwards, reportAwards } from "@/modules/notices";
import { ListeningTracker } from "./listening";
import type { PlayerState } from "./types";

let engine: PlayerEngine | null = null;

/** The one engine of this tab (client only). It lives outside React, so navigation never stops playback. */
export function getPlayer(): PlayerEngine {
  engine ??= new PlayerEngine();
  return engine;
}

const subscribe = (listener: () => void) => getPlayer().subscribe(listener);
const getSnapshot = () => getPlayer().getState();
const getServerSnapshot = () => IDLE_STATE;

export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

let reporting = false;

/**
 * Sends listens of this tab to the server (signed-in listeners only — the server checks again)
 * and shows what they earned. keepalive lets the last listen leave even while the page is closing.
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
  const player = getPlayer();
  player.subscribe(() => tracker.update(player.getState()));
  window.addEventListener("pagehide", () => tracker.flush());
}
