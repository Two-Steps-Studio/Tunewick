import { describe, expect, it } from "vitest";
import { IDLE_STATE } from "./engine/engine";
import { type Listen, ListeningTracker } from "./listening";
import type { PlayerState, PlayerTrack } from "./types";

const track = (id: string) => ({ id, title: id, artist: "A" }) as unknown as PlayerTrack;
const queue = [track("a"), track("b"), track("a")];

function state(index: number, position: number, status: PlayerState["status"] = "playing") {
  return { ...IDLE_STATE, queue, index, position, duration: 120, status } as PlayerState;
}

function setup() {
  const sent: Listen[] = [];
  const tracker = new ListeningTracker(
    (listen) => sent.push(listen),
    () => 0,
  );
  return { sent, tracker };
}

describe("ListeningTracker", () => {
  it("counts the time actually played and sends it when the track changes", () => {
    const { sent, tracker } = setup();
    for (let s = 0; s <= 30; s += 0.25) tracker.update(state(0, s));
    tracker.update(state(1, 0));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ trackId: "a", msPlayed: 30000, completed: false });
  });

  it("does not count seeks or paused time", () => {
    const { sent, tracker } = setup();
    tracker.update(state(0, 0));
    tracker.update(state(0, 1));
    tracker.update(state(0, 60)); // seek forward
    tracker.update(state(0, 61));
    tracker.update(state(0, 62, "paused"));
    tracker.update(state(0, 63));
    tracker.flush();
    expect(sent[0]!.msPlayed).toBe(2000 + 1000);
  });

  it("ignores skips under a second", () => {
    const { sent, tracker } = setup();
    tracker.update(state(0, 0));
    tracker.update(state(0, 0.5));
    tracker.update(state(1, 0));
    expect(sent).toHaveLength(0);
  });

  it("marks a listen to the end as completed and keeps duplicates apart", () => {
    const { sent, tracker } = setup();
    tracker.update(state(0, 118));
    tracker.update(state(0, 119.5));
    tracker.update(state(1, 0));
    tracker.update(state(1, 2));
    tracker.update(state(2, 0));
    tracker.update(state(2, 1.5));
    tracker.update({ ...state(2, 1.5), status: "idle" });
    expect(sent.map((l) => [l.trackId, l.completed])).toEqual([
      ["a", true],
      ["b", false],
      ["a", false],
    ]);
  });
});
