import "server-only";

import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import sharp from "sharp";

/**
 * Shareable images in Tunewick's brand (design-system.md: graphite, ivory, lime action colour,
 * coral spark): Open Graph previews, 9:16 story cards (TikTok, Reels, Shorts, Snapchat) and
 * square posts (X, Discord, Instagram feed). Text only from real data.
 */

const C = {
  graphite: "#171515",
  raised: "#232020",
  ivory: "#f2ebdd",
  muted: "#9a928a",
  lime: "#d8ff3e",
  coral: "#ff5c5c",
  purple: "#7657ff",
};

export type CardFormat = "og" | "story" | "square";

/** A QR code (SVG data URL, graphite on ivory) that opens `url` — for printed and filmed cards. */
export async function qrDataUrl(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#171515", light: "#f2ebdd" },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function Qr({ src, size }: { src: string; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by Satori
  return <img src={src} width={size} height={size} alt="" />;
}

/**
 * Covers are stored as WebP, which the card renderer cannot decode: fetch the variant and hand it
 * over as a PNG data URL. Null when it cannot be loaded (the card then shows a colour tile).
 */
export async function coverForCard(url: string | null, size: number): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(size, size, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
      <div style={{ width: size * 0.55, height: size * 0.55, background: C.coral }} />
      <div style={{ fontSize: size, color: C.ivory, letterSpacing: -1, fontWeight: 700 }}>
        tunewick
      </div>
    </div>
  );
}

function Cover({
  src,
  color,
  size,
  letter,
}: {
  src: string | null;
  color: string | null;
  size: number;
  letter: string;
}) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by Satori
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      style={{ objectFit: "cover", background: color ?? C.raised }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        background: color ?? C.purple,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        color: C.ivory,
      }}
    >
      {letter.toUpperCase()}
    </div>
  );
}

export interface SongCardData {
  title: string;
  artist: string;
  place: string;
  cover: string | null;
  color: string | null;
  /** Localized lines. */
  tagline: string;
  cta: string;
  url: string;
  /** QR code to the song (story and square cards). */
  qr?: string | null;
}

export function songCard(data: SongCardData, format: CardFormat) {
  const { width, height } = CARD_SIZES[format];
  const vertical = format === "story";
  const coverSize = format === "og" ? 470 : vertical ? 860 : 560;
  const titleSize = format === "og" ? 64 : vertical ? 92 : 72;
  const info = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: vertical ? 22 : 14,
        maxWidth: format === "og" ? 560 : coverSize,
      }}
    >
      <div
        style={{
          fontSize: vertical ? 30 : 24,
          color: C.lime,
          textTransform: "uppercase",
          letterSpacing: 4,
        }}
      >
        {data.tagline}
      </div>
      <div style={{ fontSize: titleSize, color: C.ivory, lineHeight: 1.02, letterSpacing: -2 }}>
        {data.title}
      </div>
      <div style={{ fontSize: titleSize * 0.55, color: C.ivory }}>{data.artist}</div>
      {data.place ? (
        <div style={{ fontSize: titleSize * 0.38, color: C.muted }}>{data.place}</div>
      ) : null}
    </div>
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: format === "og" ? "row" : "column",
        alignItems: format === "og" ? "center" : "flex-start",
        justifyContent: "space-between",
        gap: 48,
        padding: vertical ? 96 : 64,
        background: `linear-gradient(160deg, ${data.color ?? C.raised} 0%, ${C.graphite} 62%)`,
      }}
    >
      {format === "og"
        ? [
            <Cover
              key="cover"
              src={data.cover}
              color={data.color}
              size={coverSize}
              letter={data.artist.slice(0, 1)}
            />,
            <div
              key="side"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: coverSize,
              }}
            >
              <Brand size={40} />
              {info}
              <div style={{ fontSize: 26, color: C.lime }}>{data.cta}</div>
            </div>,
          ]
        : [
            <Brand key="brand" size={vertical ? 56 : 44} />,
            <Cover
              key="cover"
              src={data.cover}
              color={data.color}
              size={coverSize}
              letter={data.artist.slice(0, 1)}
            />,
            <div key="info" style={{ display: "flex" }}>
              {info}
            </div>,
            <div
              key="cta"
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 32,
                width: "100%",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ fontSize: vertical ? 40 : 30, color: C.lime }}>{data.cta}</div>
                <div style={{ fontSize: vertical ? 26 : 22, color: C.muted }}>{data.url}</div>
              </div>
              {data.qr ? <Qr src={data.qr} size={vertical ? 180 : 140} /> : null}
            </div>,
          ]}
    </div>,
    { width, height, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}

export interface StatsCardData {
  heading: string;
  lines: { value: string; label: string }[];
  question: string;
  url: string;
  qr?: string | null;
}

/** "MY TUNEWICK WEEK" — the listener's own numbers. Private to whoever downloads it. */
export function statsCard(data: StatsCardData, format: Exclude<CardFormat, "og">) {
  const { width, height } = CARD_SIZES[format];
  const vertical = format === "story";
  const valueSize = vertical ? 132 : 96;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: vertical ? 96 : 72,
        background: `linear-gradient(170deg, ${C.purple} 0%, ${C.graphite} 55%)`,
      }}
    >
      <Brand size={vertical ? 56 : 44} />
      <div style={{ display: "flex", flexDirection: "column", gap: vertical ? 40 : 22 }}>
        <div style={{ fontSize: vertical ? 54 : 42, color: C.lime, letterSpacing: 6 }}>
          {data.heading}
        </div>
        {data.lines.map((line) => (
          <div key={line.label} style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
            <div style={{ fontSize: valueSize, color: C.ivory, letterSpacing: -4, lineHeight: 1 }}>
              {line.value}
            </div>
            <div style={{ fontSize: valueSize * 0.3, color: C.muted }}>{line.label}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 32,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <div style={{ fontSize: vertical ? 50 : 38, color: C.ivory }}>{data.question}</div>
          <div style={{ fontSize: vertical ? 30 : 24, color: C.muted }}>{data.url}</div>
        </div>
        {data.qr ? <Qr src={data.qr} size={vertical ? 180 : 140} /> : null}
      </div>
    </div>,
    { width, height, headers: { "Cache-Control": "private, no-store" } },
  );
}
