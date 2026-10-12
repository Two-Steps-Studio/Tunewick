#!/usr/bin/env node
/**
 * Builds apps/web/src/modules/atlas/world-paths.json: one SVG path per country (ISO alpha-2), Equal
 * Earth projection, from Natural Earth 1:110m (world-atlas). Done once here so the app ships plain
 * path strings — no map library, no tiles, no projection at request time.
 *
 *   node scripts/build-world-map.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { geoEqualEarth, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topology = JSON.parse(
  readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"),
);
const all = feature(topology, topology.objects.countries);
// Antarctica only takes room.
const world = { ...all, features: all.features.filter((f) => String(f.id) !== "010") };
const WIDTH = 1000;
const HEIGHT = 480;
const projection = geoEqualEarth().fitExtent(
  [
    [4, 4],
    [WIDTH - 4, HEIGHT - 4],
  ],
  world,
);
const path = geoPath(projection).digits(1);

const paths = {};
for (const country of world.features) {
  const code = countries.numericToAlpha2(String(country.id).padStart(3, "0"));
  if (!code) continue;
  const d = path(country);
  if (d) paths[code] = (paths[code] ?? "") + d;
}
const out = join(
  import.meta.dirname,
  "..",
  "apps",
  "web",
  "src",
  "modules",
  "atlas",
  "world-paths.json",
);
writeFileSync(out, JSON.stringify({ viewBox: `0 0 ${WIDTH} ${HEIGHT}`, paths }) + "\n");
console.log(`${Object.keys(paths).length} countries → ${out}`);
