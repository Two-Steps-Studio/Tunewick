import { describe, expect, it } from "vitest";
import {
  describeQuality,
  formatSampleRate,
  type DeliveredQuality,
  type SourceQuality,
} from "./quality";

const flac2496: SourceQuality = {
  codec: "flac",
  isLosslessCodec: true,
  sampleRateHz: 96000,
  bitDepth: 24,
  effectiveBitDepth: 24,
  authenticity: "verified_lossless",
};

const flac1644: SourceQuality = {
  codec: "flac",
  isLosslessCodec: true,
  sampleRateHz: 44100,
  bitDepth: 16,
  effectiveBitDepth: 16,
  authenticity: "verified_lossless",
};

const hires2496: DeliveredQuality = {
  tier: "hires",
  codec: "flac",
  sampleRateHz: 96000,
  bitDepth: 24,
  bitrateKbps: null,
};

describe("formatSampleRate", () => {
  it("formats common rates as kHz without trailing zeros", () => {
    expect(formatSampleRate(44100)).toBe("44.1");
    expect(formatSampleRate(48000)).toBe("48");
    expect(formatSampleRate(88200)).toBe("88.2");
    expect(formatSampleRate(192000)).toBe("192");
  });
});

describe("describeQuality", () => {
  it("labels native Hi-Res delivery as Hi-Res and lossless", () => {
    const q = describeQuality(flac2496, hires2496);
    expect(q.kind).toBe("hires");
    expect(q.isLossless).toBe(true);
    expect(q.isHiRes).toBe(true);
    expect(q.sourceText).toBe("FLAC 24/96");
    expect(q.deliveredText).toBe("FLAC 24/96");
    expect(q.notes).toEqual([]);
  });

  it("labels a 16-bit lossless variant of a 24/96 master as Lossless, not Hi-Res", () => {
    const q = describeQuality(flac2496, {
      tier: "lossless",
      codec: "flac",
      sampleRateHz: 48000,
      bitDepth: 16,
      bitrateKbps: null,
    });
    expect(q.kind).toBe("lossless");
    expect(q.isHiRes).toBe(false);
    expect(q.deliveredText).toBe("FLAC 16/48");
  });

  it("labels AAC delivery as lossy with bitrate", () => {
    const q = describeQuality(flac1644, {
      tier: "high",
      codec: "aac_lc",
      sampleRateHz: 44100,
      bitDepth: null,
      bitrateKbps: 256,
    });
    expect(q.kind).toBe("lossy");
    expect(q.isLossless).toBe(false);
    expect(q.deliveredText).toBe("AAC 256 kbps");
  });

  it("never calls FLAC from a suspected lossy-origin source lossless", () => {
    const q = describeQuality(
      { ...flac1644, authenticity: "suspected_lossy_origin" },
      { tier: "lossless", codec: "flac", sampleRateHz: 44100, bitDepth: 16, bitrateKbps: null },
    );
    expect(q.isLossless).toBe(false);
    expect(q.kind).toBe("lossy");
    expect(q.notes).toContain("source_lossy_origin_suspected");
  });

  it("never calls an upsampled source Hi-Res", () => {
    const q = describeQuality({ ...flac2496, authenticity: "suspected_upsampled" }, hires2496);
    expect(q.isHiRes).toBe(false);
    expect(q.kind).toBe("lossless");
    expect(q.notes).toContain("source_upsampled_suspected");
  });

  it("never calls bit-padded 24-bit Hi-Res when the effective depth is 16 at 44.1 kHz", () => {
    const q = describeQuality(
      {
        ...flac1644,
        bitDepth: 24,
        effectiveBitDepth: 16,
        authenticity: "suspected_bit_padded",
      },
      { tier: "hires", codec: "flac", sampleRateHz: 44100, bitDepth: 24, bitrateKbps: null },
    );
    expect(q.isHiRes).toBe(false);
  });

  it("rejects a delivered variant above the source sample rate as Hi-Res (no upsampling)", () => {
    const q = describeQuality(
      { ...flac2496, sampleRateHz: 48000 },
      { ...hires2496, sampleRateHz: 96000 },
    );
    expect(q.isHiRes).toBe(false);
    expect(q.notes).toContain("delivered_exceeds_source");
  });

  it("reports system resampling when output rate differs from delivered rate", () => {
    const q = describeQuality(flac2496, hires2496, { outputSampleRateHz: 48000 });
    expect(q.outputText).toBe("48 kHz");
    expect(q.notes).toContain("output_resampled_by_system");
  });

  it("omits output info when output rate matches", () => {
    const q = describeQuality(flac2496, hires2496, { outputSampleRateHz: 96000 });
    expect(q.outputText).toBeNull();
    expect(q.notes).not.toContain("output_resampled_by_system");
  });
});
