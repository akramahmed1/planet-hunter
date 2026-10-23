// Performance budget for the pages that carry 3D (Phase 3, and the home globe in T30), checked after `next build`.
//
// First-load JavaScript (the shared runtime, the layout's, the template's and the page's chunks, gzipped) must stay under
// BUDGET_KB, and three.js must not be part of it: the 3D views are loaded on demand after first paint.
//
// Next 16 builds with Turbopack, which has no `app-build-manifest.json`. Each page's own
// `build-manifest.json` lists the shared runtime files, and its `page_client-reference-manifest.js` lists the chunks of
// the layout, template and page (`entryJSFiles`). The polyfill file (only loaded by very old browsers) is not counted,
// as before.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 200;
const PAGES = [
  { route: "/solar-system", dir: "solar-system", key: "[project]/app/solar-system/page" },
  { route: "/", dir: "", key: "[project]/app/page" },
];
const next = join(import.meta.dirname, "..", ".next");

function entryFiles(page) {
  const base = join(next, "server", "app", page.dir);
  const build = JSON.parse(readFileSync(join(base, "page", "build-manifest.json"), "utf8"));
  const refs = readFileSync(join(base, "page_client-reference-manifest.js"), "utf8");
  const start = refs.indexOf('"entryJSFiles":');
  if (start < 0) throw new Error(`no entryJSFiles in the client reference manifest of ${page.route}`);
  // The manifest is a JavaScript assignment; read the object that follows the key by matching braces.
  const from = refs.indexOf("{", start);
  let depth = 0;
  let end = from;
  for (; end < refs.length; end++) {
    if (refs[end] === "{") depth++;
    else if (refs[end] === "}" && --depth === 0) break;
  }
  const entries = JSON.parse(refs.slice(from, end + 1));
  const wanted = ["[project]/app/layout", "[project]/app/template", page.key];
  for (const w of wanted) if (!entries[w]) throw new Error(`${w} is missing from the manifest of ${page.route}`);
  return [...new Set([...build.rootMainFiles, ...wanted.flatMap((w) => entries[w])])].filter((f) =>
    f.endsWith(".js"),
  );
}

let failed = false;
for (const page of PAGES) {
  let files;
  try {
    files = entryFiles(page);
  } catch (e) {
    console.error(String(e));
    failed = true;
    continue;
  }
  let total = 0;
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(join(next, f));
    total += gzipSync(src).length;
    // A string three.js's renderer always contains.
    if (src.includes("WebGLRenderer")) offenders.push(f);
  }
  const kb = total / 1024;
  console.log(`${page.route} first-load JS: ${kb.toFixed(1)} KB gzipped across ${files.length} files (budget ${BUDGET_KB} KB)`);
  if (offenders.length) {
    console.error(`three.js is in the first-load bundle of ${page.route}: ${offenders.join(", ")}`);
    failed = true;
  }
  if (kb > BUDGET_KB) {
    console.error(`${page.route} is over budget`);
    failed = true;
  }
}
if (failed) process.exit(1);
