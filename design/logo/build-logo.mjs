// Builds the Tunewick logo set (concept A "Wick", chosen 2026-10-05).
// Run: node design/logo/build-logo.mjs
// Outputs vector SVGs in design/logo/ and app icons in apps/web/src/app + apps/web/public.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import sharp from "sharp";
import { decompress } from "wawoff2";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const appDir = join(root, "apps", "web", "src", "app");
const publicDir = join(root, "apps", "web", "public");

const C = {
  graphite: "#171515",
  ivory: "#F2EBDD",
  lime: "#D8FF3E",
  coral: "#FF5C5C",
};

// ---------------------------------------------------------------------------
// Symbol: T crossbar + one zigzag stroke (T stem is the first stroke of W) + detached spark.
// ---------------------------------------------------------------------------
function symbolShapes(ink, spark) {
  return [
    `<rect x="4" y="9" width="30" height="9" fill="${ink}"/>`,
    `<path d="M14.5 18V55L27 33L38 55L51 21" fill="none" stroke="${ink}" stroke-width="9" stroke-miterlimit="10"/>`,
    `<rect x="48" y="4" width="10" height="10" fill="${spark}"/>`,
  ].join("");
}

function symbolSvg(ink, spark, { background, size = 64, padding = 0 } = {}) {
  const box = 64 + padding * 2;
  const bg = background ? `<rect width="${box}" height="${box}" fill="${background}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-padding} ${-padding} ${box} ${box}">` +
    (background ? `<g transform="translate(${-padding} ${-padding})">${bg}</g>` : "") +
    symbolShapes(ink, spark) +
    `</svg>\n`
  );
}

// ---------------------------------------------------------------------------
// Wordmark: "tunewıck" outlined from Bricolage Grotesque 800 / wdth 85 / opsz 96,
// tracking -0.02em, square spark replacing the dot of the i.
// ---------------------------------------------------------------------------
// fontkit cannot instantiate variations from WOFF2 directly, so decompress to TTF first.
const ttf = Buffer.from(
  await decompress(readFileSync(join(here, "source", "BricolageGrotesque-latin-subset.woff2"))),
);
const baseFont = fontkit.create(ttf);
const font = baseFont.getVariation({ opsz: 96, wght: 800, wdth: 85 });

const upm = font.unitsPerEm;
const tracking = -0.02 * upm; // looser than the board (-0.045em) so letters never touch at small sizes
const run = font.layout("tunewıck");

let penX = 0;
const glyphPaths = [];
let dotlessI = null;
run.glyphs.forEach((glyph, index) => {
  const x = penX + run.positions[index].xOffset;
  const commands = glyph.path.commands
    .map((c) => {
      const pts = [];
      for (let i = 0; i < c.args.length; i += 2) {
        pts.push(`${round(c.args[i] + x)} ${round(-c.args[i + 1])}`);
      }
      const op = {
        moveTo: "M",
        lineTo: "L",
        quadraticCurveTo: "Q",
        bezierCurveTo: "C",
        closePath: "Z",
      }[c.command];
      return op + pts.join(" ");
    })
    .join("");
  glyphPaths.push(commands);
  if (glyph.codePoints.includes(0x131)) {
    const bbox = glyph.bbox;
    dotlessI = { left: x + bbox.minX, right: x + bbox.maxX };
  }
  // fontkit does not apply HVAR, so advances come from the default (light) master.
  // Rebuild the advance from the bold outline, keeping the default right side bearing.
  const base = baseFont.getGlyph(glyph.id);
  const rsb = base.advanceWidth - base.bbox.maxX;
  const advance = glyph.bbox.maxX + rsb;
  penX += advance + (index < run.glyphs.length - 1 ? tracking : 0);
});

const sparkSize = 0.17 * upm;
const stemCenter = (dotlessI.left + dotlessI.right) / 2;
const sparkX = stemCenter - sparkSize * 0.5;
const sparkBottom = font.xHeight + 0.075 * upm;
const sparkY = -(sparkBottom + sparkSize);

const ascentTop = Math.min(sparkY, -font.capHeight);
const descentBottom = -font.descent > 0 ? 0 : 0; // wordmark has no descenders
const minX = Math.min(0, ...[0]);
const pad = 0.02 * upm;
const vb = {
  x: round(minX - pad),
  y: round(ascentTop - pad),
  w: round(penX + pad * 2),
  h: round(-ascentTop + descentBottom + pad * 2 + 0.01 * upm),
};
const wordPath = glyphPaths.join("");
const spark = { x: round(sparkX), y: round(sparkY), size: round(sparkSize) };

function wordmarkSvg(ink, sparkColor, height = 64) {
  const width = round((vb.w / vb.h) * height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">` +
    `<title>Tunewick</title>` +
    `<path d="${wordPath}" fill="${ink}"/>` +
    `<rect x="${spark.x}" y="${spark.y}" width="${spark.size}" height="${spark.size}" fill="${sparkColor}"/>` +
    `</svg>\n`
  );
}

function round(n) {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Write vector assets
// ---------------------------------------------------------------------------
const out = (name, content) => writeFileSync(join(here, name), content);
out("tunewick-symbol-on-dark.svg", symbolSvg(C.ivory, C.lime));
out("tunewick-symbol-on-light.svg", symbolSvg(C.graphite, C.coral));
out("tunewick-symbol-on-lime.svg", symbolSvg(C.graphite, C.graphite, { background: C.lime }));
out("tunewick-symbol-mono.svg", symbolSvg("#000", "#000"));
out("tunewick-wordmark-on-dark.svg", wordmarkSvg(C.ivory, C.lime));
out("tunewick-wordmark-on-light.svg", wordmarkSvg(C.graphite, C.coral));
out("tunewick-wordmark-mono.svg", wordmarkSvg("#000", "#000"));

// React component data for the app header (fill via currentColor / CSS variable).
writeFileSync(
  join(root, "apps", "web", "src", "components", "shell", "wordmark-data.ts"),
  `// Generated by design/logo/build-logo.mjs — do not edit by hand.\n` +
    `export const WORDMARK_VIEWBOX = "${vb.x} ${vb.y} ${vb.w} ${vb.h}";\n` +
    `export const WORDMARK_ASPECT = ${round((vb.w / vb.h) * 1000) / 1000};\n` +
    `export const WORDMARK_PATH =\n  "${wordPath}";\n` +
    `export const WORDMARK_SPARK = { x: ${spark.x}, y: ${spark.y}, size: ${spark.size} } as const;\n`,
);

// ---------------------------------------------------------------------------
// App icons
// ---------------------------------------------------------------------------
// Tab icon: symbol on a graphite square so it reads on light and dark browser chrome.
const iconSvg = symbolSvg(C.ivory, C.lime, { background: C.graphite, padding: 6, size: 32 });
writeFileSync(join(appDir, "icon.svg"), iconSvg);

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 288 }) // 4x supersampling of the SVG's own size
    .resize(size, size)
    .png()
    .toBuffer();

const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map((s) => png(iconSvg, s)));
writeFileSync(join(appDir, "favicon.ico"), buildIco(icoSizes, icoPngs));
writeFileSync(
  join(appDir, "apple-icon.png"),
  await png(symbolSvg(C.ivory, C.lime, { background: C.graphite, padding: 14, size: 180 }), 180),
);

mkdirSync(join(publicDir, "icons"), { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(
    join(publicDir, "icons", `icon-${size}.png`),
    await png(symbolSvg(C.ivory, C.lime, { background: C.graphite, padding: 8, size }), size),
  );
}
// Maskable: content within the central 80% safe zone.
writeFileSync(
  join(publicDir, "icons", "icon-maskable-512.png"),
  await png(symbolSvg(C.ivory, C.lime, { background: C.graphite, padding: 22, size: 512 }), 512),
);

// Preview PNGs for review.
for (const [name, svg] of [
  ["preview-symbol-16.png", iconSvg],
  ["preview-wordmark-dark.png", wordmarkSvg(C.ivory, C.lime, 120)],
]) {
  const size = name.includes("16") ? 16 : undefined;
  const img = sharp(Buffer.from(svg), { density: 300 });
  writeFileSync(join(here, name), await (size ? img.resize(size, size) : img).png().toBuffer());
}

function buildIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const entries = [];
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(e);
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

console.log("wordmark viewBox", vb, "spark", spark);
