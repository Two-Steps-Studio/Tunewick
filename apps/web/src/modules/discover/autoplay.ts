import "server-only";

import { getPlayableQueue, listenerEntitlement } from "@/modules/audio";
import type { PlayerTrack } from "@/modules/player";
import { rankRadio } from "./feed";

/**
 * Autoplay: a few playable songs like `trackId` for when the player's queue runs out. `exclude`:
 * the songs already in the queue. Empty when nothing fits (the player then just stops).
 */
export async function getAutoplayTracks(trackId: string, exclude: string[]) {
  const items = await rankRadio(trackId, exclude, 8);
  const playable = await getPlayableQueue(items, await listenerEntitlement());
  return playable.filter((t): t is PlayerTrack => t !== null).slice(0, 5);
}
