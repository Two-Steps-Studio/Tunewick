/**
 * Honest audio quality model (docs/audio.md §5).
 *
 * The player may only show a quality property when it is true for the level shown:
 * source (the master), delivered (the variant playing) and output (what the device does).
 */

export type DeliveryCodec = "flac" | "aac_lc";
export type QualityTier = "data_saver" | "high" | "lossless" | "hires";
export type Authenticity =
  | "verified_lossless"
  | "suspected_lossy_origin"
  | "suspected_upsampled"
  | "suspected_bit_padded"
  | "unknown";

export interface SourceQuality {
  codec: string;
  isLosslessCodec: boolean;
  sampleRateHz: number;
  /** Container bit depth; null for codecs without one. */
  bitDepth: number | null;
  /** Bit depth measured by analysis (e.g. 16 for zero-padded 24-bit files). */
  effectiveBitDepth: number | null;
  authenticity: Authenticity;
}

export interface DeliveredQuality {
  tier: QualityTier;
  codec: DeliveryCodec;
  sampleRateHz: number;
  bitDepth: number | null;
  bitrateKbps: number | null;
}

export type QualityNote =
  | "source_lossy_origin_suspected"
  | "source_upsampled_suspected"
  | "source_bit_padded_suspected"
  | "delivered_exceeds_source"
  | "output_resampled_by_system";

export interface QualityDescription {
  kind: "hires" | "lossless" | "lossy";
  isLossless: boolean;
  isHiRes: boolean;
  /** Language-neutral technical strings, e.g. "FLAC 24/96". */
  sourceText: string;
  deliveredText: string;
  /** Output sample rate when it differs from delivered, e.g. "48 kHz"; otherwise null. */
  outputText: string | null;
  notes: QualityNote[];
}

const CODEC_NAMES: Record<string, string> = {
  flac: "FLAC",
  alac: "ALAC",
  pcm: "PCM",
  wav: "WAV",
  aiff: "AIFF",
  aac_lc: "AAC",
};

export function formatSampleRate(hz: number): string {
  return String(Math.round(hz / 100) / 10);
}

function codecName(codec: string): string {
  return CODEC_NAMES[codec] ?? codec.toUpperCase();
}

function formatLosslessSpec(codec: string, bitDepth: number | null, sampleRateHz: number): string {
  const rate = formatSampleRate(sampleRateHz);
  return bitDepth === null
    ? `${codecName(codec)} ${rate} kHz`
    : `${codecName(codec)} ${bitDepth}/${rate}`;
}

export function describeQuality(
  source: SourceQuality,
  delivered: DeliveredQuality,
  options: { outputSampleRateHz?: number } = {},
): QualityDescription {
  const notes: QualityNote[] = [];

  if (source.authenticity === "suspected_lossy_origin") notes.push("source_lossy_origin_suspected");
  if (source.authenticity === "suspected_upsampled") notes.push("source_upsampled_suspected");
  if (source.authenticity === "suspected_bit_padded") notes.push("source_bit_padded_suspected");

  const sourceDepth = source.effectiveBitDepth ?? source.bitDepth;
  const exceedsSource =
    delivered.sampleRateHz > source.sampleRateHz ||
    (delivered.bitDepth !== null && sourceDepth !== null && delivered.bitDepth > sourceDepth);
  if (exceedsSource) notes.push("delivered_exceeds_source");

  const isLossless =
    delivered.codec === "flac" &&
    source.isLosslessCodec &&
    source.authenticity !== "suspected_lossy_origin";

  const isHiRes =
    isLossless &&
    source.authenticity === "verified_lossless" &&
    !exceedsSource &&
    ((delivered.bitDepth ?? 0) > 16 || delivered.sampleRateHz > 48000);

  const deliveredText =
    delivered.codec === "flac"
      ? formatLosslessSpec(delivered.codec, delivered.bitDepth, delivered.sampleRateHz)
      : `${codecName(delivered.codec)} ${delivered.bitrateKbps ?? "?"} kbps`;

  let outputText: string | null = null;
  if (
    options.outputSampleRateHz !== undefined &&
    options.outputSampleRateHz !== delivered.sampleRateHz
  ) {
    outputText = `${formatSampleRate(options.outputSampleRateHz)} kHz`;
    notes.push("output_resampled_by_system");
  }

  return {
    kind: isHiRes ? "hires" : isLossless ? "lossless" : "lossy",
    isLossless,
    isHiRes,
    sourceText: formatLosslessSpec(source.codec, source.bitDepth, source.sampleRateHz),
    deliveredText,
    outputText,
    notes,
  };
}
