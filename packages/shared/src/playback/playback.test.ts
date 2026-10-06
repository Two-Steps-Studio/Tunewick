import { describe, expect, it } from "vitest";
import { chooseTier, tierAfterStall, type AvailableVariant, type TierInput } from "./auto-quality";
import { applyAppendPlan, planGaplessAppends } from "./gapless";
import {
  choosePlayback,
  playableTiers,
  resolvePlayback,
  type PlaybackCapabilities,
  type Rendition,
} from "./strategy";

// --- gapless ------------------------------------------------------------------------------------

describe("planGaplessAppends", () => {
  it("places AAC tracks back to back and trims priming and padding", () => {
    // Worker output for three 4 s tracks at 48 kHz (spike album).
    const track = {
      sampleRateHz: 48000,
      samples: 192000,
      encoderDelaySamples: 1024,
      paddingSamples: 512,
    };
    const plan = planGaplessAppends([track, track, track]);

    expect(plan.map((p) => p.start)).toEqual([0, 4, 8]);
    expect(plan.map((p) => p.end)).toEqual([4, 8, 12]);
    expect(plan[1]!.timestampOffset).toBeCloseTo(4 - 1024 / 48000, 12);
    expect(plan[1]!.appendWindowStart).toBe(4);
    expect(plan[1]!.appendWindowEnd).toBe(8);
    // Total buffered = exactly the music, not 12.064 s as without the trim.
    expect(plan.at(-1)!.end).toBe(12);
  });

  it("needs no offset for FLAC", () => {
    const plan = planGaplessAppends([
      { sampleRateHz: 44100, samples: 441000, encoderDelaySamples: 0, paddingSamples: 0 },
      { sampleRateHz: 44100, samples: 220500, encoderDelaySamples: 0, paddingSamples: 0 },
    ]);
    expect(plan[1]).toEqual({
      start: 10,
      end: 15,
      timestampOffset: 10,
      appendWindowStart: 10,
      appendWindowEnd: 15,
    });
  });

  it("does not accumulate rounding error over a long album", () => {
    const track = {
      sampleRateHz: 44100,
      samples: 7_938_441,
      encoderDelaySamples: 1024,
      paddingSamples: 0,
    };
    const plan = planGaplessAppends(Array.from({ length: 40 }, () => track));
    expect(plan.at(-1)!.end).toBe((40 * 7_938_441) / 44100);
  });

  it("rejects invalid timing", () => {
    expect(() =>
      planGaplessAppends([
        { sampleRateHz: 48000, samples: 0, encoderDelaySamples: 0, paddingSamples: 0 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      planGaplessAppends([
        { sampleRateHz: 48000, samples: 10.5, encoderDelaySamples: 0, paddingSamples: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it("applies a later window without ever making start ≥ end", () => {
    const writes: string[] = [];
    const state = { timestampOffset: 0, appendWindowStart: 0, appendWindowEnd: 4 };
    const buffer = new Proxy(state, {
      set(target, key: keyof typeof state, value: number) {
        const next = { ...target, [key]: value };
        if (next.appendWindowStart >= next.appendWindowEnd) throw new TypeError("invalid window");
        writes.push(String(key));
        target[key] = value;
        return true;
      },
    });
    const [, second] = planGaplessAppends([
      { sampleRateHz: 48000, samples: 192000, encoderDelaySamples: 1024, paddingSamples: 512 },
      { sampleRateHz: 48000, samples: 192000, encoderDelaySamples: 1024, paddingSamples: 512 },
    ]);
    applyAppendPlan(buffer, second!);
    expect(state).toEqual({
      timestampOffset: second!.timestampOffset,
      appendWindowStart: 4,
      appendWindowEnd: 8,
    });
    expect(writes).toEqual([
      "appendWindowEnd",
      "appendWindowStart",
      "appendWindowEnd",
      "timestampOffset",
    ]);
  });
});

// --- strategy -----------------------------------------------------------------------------------

const renditions: Rendition[] = [
  { tier: "data_saver", codec: "aac_lc", container: "fmp4", sampleRateHz: 48000 },
  { tier: "high", codec: "aac_lc", container: "fmp4", sampleRateHz: 48000 },
  { tier: "lossless", codec: "flac", container: "flac", sampleRateHz: 48000 },
  { tier: "lossless", codec: "flac", container: "fmp4", sampleRateHz: 48000 },
  { tier: "hires", codec: "flac", container: "flac", sampleRateHz: 96000 },
];

const chromium: PlaybackCapabilities = {
  engine: "chromium",
  mse: true,
  decodes: {
    mseAac: true,
    mseFlac: true,
    nativeAac: true,
    nativeFlac: true,
    nativeFlacHiRes: true,
  },
};

describe("choosePlayback", () => {
  it("prefers gapless MSE where it decodes", () => {
    const choice = choosePlayback(renditions, "lossless", chromium);
    expect(choice).toMatchObject({
      strategy: "mse",
      gapless: true,
      rendition: { container: "fmp4" },
    });
  });

  it("plays Hi-Res as plain FLAC (no fMP4 above 48 kHz)", () => {
    const choice = choosePlayback(renditions, "hires", chromium);
    expect(choice).toMatchObject({
      strategy: "native",
      gapless: false,
      rendition: { container: "flac" },
    });
  });

  it("falls back to native FLAC on Safari despite a positive MSE probe (known-broken list)", () => {
    const safari = { ...chromium, engine: "webkit" as const };
    const choice = choosePlayback(renditions, "lossless", safari);
    expect(choice).toMatchObject({ strategy: "native", rendition: { container: "flac" } });
    expect(choosePlayback(renditions, "high", safari)?.strategy).toBe("mse");
  });

  it("uses native playback without MSE", () => {
    const noMse = { ...chromium, mse: false };
    expect(choosePlayback(renditions, "high", noMse)).toMatchObject({ strategy: "native" });
  });

  it("steps down when a tier cannot be decoded at all", () => {
    const noFlac: PlaybackCapabilities = {
      engine: "unknown",
      mse: true,
      decodes: {
        mseAac: true,
        mseFlac: false,
        nativeAac: true,
        nativeFlac: false,
        nativeFlacHiRes: false,
      },
    };
    expect(playableTiers(renditions, noFlac)).toEqual(["data_saver", "high"]);
    expect(resolvePlayback(renditions, "hires", noFlac)).toMatchObject({
      steppedDown: true,
      rendition: { tier: "high" },
    });
  });

  it("returns null when nothing plays", () => {
    const nothing: PlaybackCapabilities = {
      engine: "unknown",
      mse: false,
      decodes: {
        mseAac: false,
        mseFlac: false,
        nativeAac: false,
        nativeFlac: false,
        nativeFlacHiRes: false,
      },
    };
    expect(resolvePlayback(renditions, "high", nothing)).toBeNull();
  });
});

// --- auto quality -------------------------------------------------------------------------------

const variants: AvailableVariant[] = [
  { tier: "data_saver", bitrateKbps: 96 },
  { tier: "high", bitrateKbps: 256 },
  { tier: "lossless", bitrateKbps: 850 },
  { tier: "hires", bitrateKbps: 2900 },
];

const premiumAuto: TierInput = {
  setting: "auto",
  entitlement: "hires",
  available: variants,
  network: { effectiveType: "4g" },
};

describe("chooseTier", () => {
  it("gives Premium the best tier on a good connection", () => {
    expect(chooseTier(premiumAuto)).toEqual({ tier: "hires", reasons: [] });
  });

  it("caps Free at High and says it is the plan", () => {
    expect(chooseTier({ ...premiumAuto, entitlement: "high" })).toEqual({
      tier: "high",
      reasons: ["plan"],
    });
  });

  it("respects Save-Data and slow networks", () => {
    expect(chooseTier({ ...premiumAuto, network: { saveData: true } })?.tier).toBe("data_saver");
    expect(chooseTier({ ...premiumAuto, network: { effectiveType: "3g" } })).toEqual({
      tier: "high",
      reasons: ["network"],
    });
  });

  it("uses measured throughput against the real variant bitrate", () => {
    const decision = chooseTier({ ...premiumAuto, network: { measuredKbps: 2000 } });
    expect(decision).toEqual({ tier: "lossless", reasons: ["throughput"] });
    expect(chooseTier({ ...premiumAuto, network: { measuredKbps: 50 } })?.tier).toBe("data_saver");
  });

  it("lets a fixed setting override network heuristics but not the plan", () => {
    const slow = { saveData: true, measuredKbps: 100 };
    expect(chooseTier({ ...premiumAuto, setting: "lossless", network: slow })).toEqual({
      tier: "lossless",
      reasons: ["setting"],
    });
    expect(chooseTier({ ...premiumAuto, entitlement: "high", setting: "hires" })?.tier).toBe(
      "high",
    );
  });

  it("picks the nearest lower available tier", () => {
    const noHiRes = variants.filter((v) => v.tier !== "hires");
    expect(chooseTier({ ...premiumAuto, available: noHiRes })).toEqual({
      tier: "lossless",
      reasons: [],
    });
    expect(chooseTier({ ...premiumAuto, available: [] })).toBeNull();
  });
});

describe("tierAfterStall", () => {
  it("steps down one available tier at a time and stops at the bottom", () => {
    expect(tierAfterStall("hires", variants)).toBe("lossless");
    expect(
      tierAfterStall(
        "lossless",
        variants.filter((v) => v.tier !== "high"),
      ),
    ).toBe("data_saver");
    expect(tierAfterStall("data_saver", variants)).toBeNull();
  });
});
