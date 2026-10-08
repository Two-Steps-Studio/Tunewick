import { describe, expect, it } from "vitest";
import { IDLE_STATE } from "./engine/engine";
import { browserFamily, type PlaybackMetric, PlaybackMetrics } from "./metrics";
import type { NowPlaying, PlayerState } from "./types";

const now = { tier: "high", strategy: "mse" } as NowPlaying;

function setup() {
  let clock = 0;
  const sent: PlaybackMetric[] = [];
  const metrics = new PlaybackMetrics(
    (m) => sent.push(m),
    () => clock,
  );
  const at = (ms: number, patch: Partial<PlayerState>) => {
    clock = ms;
    metrics.update({ ...IDLE_STATE, now, ...patch } as PlayerState);
  };
  return { sent, at };
}

describe("PlaybackMetrics", () => {
  it("measures the time from loading to playing, once per load", () => {
    const { sent, at } = setup();
    at(100, { status: "loading" });
    at(300, { status: "loading" });
    at(740, { status: "playing" });
    at(900, { status: "playing" });
    expect(sent).toEqual([
      { outcome: "started", tier: "high", strategy: "mse", firstAudioMs: 640, errorCode: null },
    ]);
  });

  it("reports an error once and nothing for a load that ends paused", () => {
    const { sent, at } = setup();
    at(0, { status: "loading" });
    at(50, { status: "paused" });
    at(60, { status: "playing" });
    at(70, { status: "loading" });
    at(80, { status: "error", error: "stream_error" });
    at(90, { status: "error", error: "stream_error" });
    expect(sent.map((m) => [m.outcome, m.errorCode])).toEqual([["error", "stream_error"]]);
  });

  it("names browser families only", () => {
    expect(browserFamily("Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("edge");
    expect(browserFamily("Mozilla/5.0 (X11; rv:143.0) Gecko/20100101 Firefox/143.0")).toBe(
      "firefox",
    );
    expect(browserFamily("Mozilla/5.0 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("safari");
    expect(browserFamily("curl/8")).toBe("other");
  });
});
