import { describe, expect, it } from "vitest";
import { detectEngine } from "./engine/probe";
import { trackFromWorkerReport, type WorkerReport } from "./from-worker-report";

const report: WorkerReport = {
  status: "accepted",
  input: { container: "wav", codec: "pcm_s24le", sample_rate: 96000, bits: 24 },
  analysis: {
    authenticity: "verified_lossless",
    effective_bits: 24,
    effective_sample_rate: 44100,
    upsampled_from: 44100,
    flags: ["suspected_upsampled"],
  },
  variants: [
    {
      tier: "high",
      codec: "aac",
      sample_rate: 44100,
      bits: null,
      bitrate_kbps: 256,
      samples: 441000,
      encoder_delay_samples: 1024,
      padding_samples: 400,
      files: [{ container: "fmp4", path: "/out/high.m4a", bytes: 330_000 }],
    },
    {
      tier: "lossless",
      codec: "flac",
      sample_rate: 44100,
      bits: 16,
      bitrate_kbps: null,
      samples: 441000,
      encoder_delay_samples: 0,
      padding_samples: 0,
      files: [
        { container: "flac", path: "/out/lossless.flac", bytes: 1_000_000 },
        { container: "fmp4", path: "C:\\out\\lossless.mp4", bytes: 1_010_000 },
      ],
    },
  ],
};

const meta = { id: "t1", title: "Track", artist: "Artist" };

describe("trackFromWorkerReport", () => {
  it("maps every produced file to a rendition with gapless metadata and a real bitrate", () => {
    const track = trackFromWorkerReport(report, meta, (name) => `/media/t1/${name}`)!;
    expect(track.renditions.map((r) => [r.tier, r.container, r.url])).toEqual([
      ["high", "fmp4", "/media/t1/high.m4a"],
      ["lossless", "flac", "/media/t1/lossless.flac"],
      ["lossless", "fmp4", "/media/t1/lossless.mp4"],
    ]);
    const aac = track.renditions[0]!;
    expect(aac).toMatchObject({
      codec: "aac_lc",
      nominalKbps: 256,
      bitrateKbps: 264, // 330 kB over 10 s
      encoderDelaySamples: 1024,
      paddingSamples: 400,
    });
  });

  it("describes the source with its effective quality", () => {
    const track = trackFromWorkerReport(report, meta, (name) => name)!;
    expect(track.source).toEqual({
      codec: "wav",
      isLosslessCodec: true,
      sampleRateHz: 96000,
      bitDepth: 24,
      effectiveBitDepth: 24,
      effectiveSampleRateHz: 44100,
      authenticity: "suspected_upsampled",
    });
  });

  it("returns null for rejected uploads", () => {
    expect(trackFromWorkerReport({ ...report, status: "rejected" }, meta, (n) => n)).toBeNull();
  });
});

describe("detectEngine", () => {
  it("recognises the engines from their user agents", () => {
    expect(
      detectEngine(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      ),
    ).toBe("chromium");
    expect(
      detectEngine(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      ),
    ).toBe("gecko");
    expect(
      detectEngine(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("webkit");
  });
});
