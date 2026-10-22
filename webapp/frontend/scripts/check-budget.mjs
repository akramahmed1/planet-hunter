// Performance budget for the pages that carry 3D (Phase 3, and the home globe in T30), checked after `next build`.
//
// First-load JavaScript (the layout's and the page's chunks, gzipped) must stay under BUDGET_KB, and three.js must not
// be part of it: the 3D views are loaded on demand after first paint.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 200;
const PAGES = ["/solar-system/page", "/page"];
const next = join(import.meta.dirname, "..", ".next");
const manifest = JSON.parse(readFileSync(join(next, "app-build-manifest.json"), "utf8")).pages;

let failed = false;
for (const page of PAGES) {
  if (!manifest[page]) {
    console.error(`${page} is missing from the build manifest`);
    failed = true;
    continue;
  }
  const files = [...new Set([...manifest["/layout"], ...manifest[page]])].filter((f) => f.endsWith(".js"));
  let total = 0;
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(join(next, f));
    total += gzipSync(src).length;
    // A string three.js's renderer always contains.
    if (src.includes("WebGLRenderer")) offenders.push(f);
  }
  const kb = total / 1024;
  console.log(`${page.replace(/\/page$/, "") || "/"} first-load JS: ${kb.toFixed(1)} KB gzipped across ${files.length} files (budget ${BUDGET_KB} KB)`);
  if (offenders.length) {
    console.error(`three.js is in the first-load bundle of ${page}: ${offenders.join(", ")}`);
    failed = true;
  }
  if (kb > BUDGET_KB) {
    console.error(`${page} is over budget`);
    failed = true;
  }
}
if (failed) process.exit(1);
