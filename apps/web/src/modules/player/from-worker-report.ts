import type { Authenticity, QualityTier, SourceQuality } from "@tunewick/shared";
import type { PlayerTrack, TrackRendition } from "./types";

/** The subset of the audio worker's JSON report (services/audio-worker) the player reads. */
export interface WorkerReport {
  status: "accepted" | "rejected";
  input: { container: string; codec: string; sample_rate: number; bits: number };
  analysis: {
    authenticity: "verified_lossless" | "suspected_lossy_origin";
    effective_bits: number;
    effective_sample_rate: number;
    upsampled_from: number | null;
    flags: string[];
  } | null;
  variants: {
    tier: QualityTier;
    codec: "aac" | "flac";
    sample_rate: number;
    bits: number | null;
    bitrate_kbps: number | null;
    samples: number;
    encoder_delay_samples: number;
    padding_samples: number;
    files: { container: "flac" | "fmp4"; path: string; bytes: number }[];
  }[];
}

function sourceAuthenticity(report: WorkerReport): Authenticity {
  const analysis = report.analysis;
  if (!analysis) return "unknown";
  if (analysis.authenticity === "suspected_lossy_origin") return "suspected_lossy_origin";
  if (analysis.upsampled_from) return "suspected_upsampled";
  if (analysis.flags.includes("suspected_bit_padded")) return "suspected_bit_padded";
  return "verified_lossless";
}

/** Container name for WAV/AIFF masters, codec name otherwise (FLAC, ALAC). */
function sourceCodec(report: WorkerReport): string {
  const { container, codec } = report.input;
  return container === "wav" || container === "aiff" ? container : codec;
}

/**
 * Maps a worker report to a playable track. `fileUrl` turns a produced file name
 * (e.g. "lossless.mp4") into the URL it is served from.
 */
export function trackFromWorkerReport(
  report: WorkerReport,
  meta: { id: string; title: string; artist: string },
  fileUrl: (fileName: string) => string,
): PlayerTrack | null {
  if (report.status !== "accepted" || !report.analysis) return null;

  const source: SourceQuality = {
    codec: sourceCodec(report),
    isLosslessCodec: true, // the worker accepts lossless masters only
    sampleRateHz: report.input.sample_rate,
    bitDepth: report.input.bits,
    effectiveBitDepth: report.analysis.effective_bits,
    effectiveSampleRateHz: report.analysis.effective_sample_rate,
    authenticity: sourceAuthenticity(report),
  };

  const renditions: TrackRendition[] = report.variants.flatMap((variant) =>
    variant.files.map((file) => ({
      tier: variant.tier,
      codec: variant.codec === "aac" ? ("aac_lc" as const) : ("flac" as const),
      container: file.container,
      sampleRateHz: variant.sample_rate,
      url: fileUrl(file.path.split(/[\\/]/).pop()!),
      bitDepth: variant.bits,
      bitrateKbps: Math.round((file.bytes * 8) / (variant.samples / variant.sample_rate) / 1000),
      nominalKbps: variant.bitrate_kbps,
      samples: variant.samples,
      encoderDelaySamples: variant.encoder_delay_samples,
      paddingSamples: variant.padding_samples,
    })),
  );

  return { ...meta, source, renditions };
}
