// Tunewick wordmark — master artwork (refinement of concept B "Split", 2026-10-08).
// Run: node design/logo/build-wordmark-master.mjs
// Outputs 1024 × 1024 transparent SVGs (outlined paths, no fonts) in design/logo/.
//
// Refinements over the header wordmark (build-logo.mjs):
// - weight 760 / width 82 / opsz 96: a touch lighter and narrower — calmer, more premium;
// - spacing fitted by eye per letter pair (outline to outline), even rhythm at every size;
// - the i's square spark exactly as wide as the stem, floating half its size above the
//   x-height — the mark's signature detail, now in proportion with the letters.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import { decompress } from "wawoff2";

const here = dirname(fileURLToPath(import.meta.url));
const C = { graphite: "#171515", ivory: "#F2EBDD", coral: "#FF5C5C" };

const ttf = Buffer.from(
  await decompress(readFileSync(join(here, "source", "BricolageGrotesque-latin-subset.woff2"))),
);
const baseFont = fontkit.create(ttf);
const font = baseFont.getVariation({ opsz: 96, wght: 760, wdth: 82 });
const upm = font.unitsPerEm;

const TEXT = "tunewıck"; // dotless i: the spark is drawn separately
// Fitting: the space between neighbouring outlines (em), set by eye per pair — straight to
// straight widest, round and diagonal sides closer, so every gap looks the same.
const gaps = { tu: 0.05, un: 0.07, ne: 0.06, ew: 0.035, wı: 0.04, ıc: 0.06, ck: 0.05 };

const run = font.layout(TEXT);
let penX = 0;
let path = "";
let stem = null;
let topLine = 0; // highest ascender among t/k (font units, y up)
run.glyphs.forEach((glyph, index) => {
  const x = penX;
  for (const c of glyph.path.commands) {
    const op = {
      moveTo: "M",
      lineTo: "L",
      quadraticCurveTo: "Q",
      bezierCurveTo: "C",
      closePath: "Z",
    }[c.command];
    const pts = [];
    for (let i = 0; i < c.args.length; i += 2) pts.push(`${r(c.args[i] + x)} ${r(-c.args[i + 1])}`);
    path += op + pts.join(" ");
  }
  const char = TEXT[index];
  if (char === "ı") stem = { left: x + glyph.bbox.minX, right: x + glyph.bbox.maxX };
  if (char === "k" || char === "t") topLine = Math.max(topLine, glyph.bbox.maxY);
  const next = TEXT[index + 1];
  if (next) {
    const following = run.glyphs[index + 1];
    penX = x + glyph.bbox.maxX + gaps[char + next] * upm - following.bbox.minX;
  } else penX = x + glyph.bbox.maxX;
});

// The spark: variant from SPARK env (A = top on the t/k ascender line, a bit narrower than the
// stem; B = as wide as the stem, floating above with a gap of half its size).
const stemWidth = stem.right - stem.left;
const variant = process.env.SPARK ?? "B";
const size = variant === "A" ? Math.round(stemWidth * 0.84) : stemWidth;
const sparkTop = variant === "A" ? topLine : font.xHeight + size * 0.5 + size;
const spark = { x: (stem.left + stem.right) / 2 - size / 2, y: -sparkTop, size };
const gap = sparkTop - size - font.xHeight;
topLine = Math.max(topLine, sparkTop);

// Fit the word into 1024 × 1024 with generous margins (wordmark ≈ 80% of the width).
const left = Math.min(0, spark.x);
const width = penX - left;
const top = -topLine;
const height = topLine; // baseline at y = 0, no descenders
const scale = (1024 * 0.8) / width;
const tx = (1024 - width * scale) / 2 - left * scale;
const ty = (1024 - height * scale) / 2 - top * scale;

function svg(ink, accent) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<title>tunewick</title>` +
    `<g transform="translate(${r(tx)} ${r(ty)}) scale(${scale.toFixed(6)})">` +
    `<path d="${path}" fill="${ink}"/>` +
    `<rect x="${r(spark.x)}" y="${r(spark.y)}" width="${r(spark.size)}" height="${r(spark.size)}" fill="${accent}"/>` +
    `</g></svg>\n`
  );
}

const suffix = process.env.SPARK ? `-${variant}` : "";
writeFileSync(join(here, `tunewick-wordmark-1024${suffix}.svg`), svg(C.graphite, C.coral));
writeFileSync(join(here, "tunewick-wordmark-1024-on-dark.svg"), svg(C.ivory, C.coral));
writeFileSync(join(here, "tunewick-wordmark-1024-mono.svg"), svg("#000000", "#000000"));
console.log(`spark ${r(size)} u, gap ${r(gap)} u, word ${r(width)} u, scale ${scale.toFixed(4)}`);

function r(n) {
  return Math.round(n * 10) / 10;
}
