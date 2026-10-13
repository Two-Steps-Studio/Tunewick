"use client";

import { usePlayerState } from "@/modules/player";
import { AddToPlaylist } from "./forms";

/** "+" in the player bar: puts whatever is playing on one of your playlists. */
export function PlayerAddToPlaylist() {
  const state = usePlayerState();
  const track = state.queue[state.index];
  if (!track) return null;
  // Keyed by track: a new song starts with a fresh menu and no old "added" message.
  return (
    <AddToPlaylist key={track.id} trackId={track.id} trackTitle={track.title} placement="above" />
  );
}
