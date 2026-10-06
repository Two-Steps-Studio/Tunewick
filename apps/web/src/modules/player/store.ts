"use client";

import { useSyncExternalStore } from "react";
import { IDLE_STATE, PlayerEngine } from "./engine/engine";
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
