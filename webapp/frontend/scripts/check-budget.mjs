// Performance budget for /solar-system (Phase 3), checked after `next build`.
//
// First-load JavaScript (the layout's and the page's chunks, gzipped) must stay
// under BUDGET_KB, and three.js must not be part of it: the 3D view is loaded
// on demand after first paint.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 200;
const next = join(import.meta.dirname, "..", ".next");
const manifest = JSON.parse(readFileSync(join(next, "app-build-manifest.json"), "utf8")).pages;

const files = [...new Set([...manifest["/layout"], ...manifest["/solar-system/page"]])].filter((f) =>
  f.endsWith(".js"),
);
let total = 0;
const offenders = [];
for (const f of files) {
  const src = readFileSync(join(next, f));
  total += gzipSync(src).length;
  // A string three.js's renderer always contains.
  if (src.includes("WebGLRenderer")) offenders.push(f);
}
const kb = total / 1024;
console.log(`/solar-system first-load JS: ${kb.toFixed(1)} KB gzipped across ${files.length} files (budget ${BUDGET_KB} KB)`);
if (offenders.length) {
  console.error(`three.js is in the first-load bundle: ${offenders.join(", ")}`);
  process.exit(1);
}
if (kb > BUDGET_KB) {
  console.error("over budget");
  process.exit(1);
}
