import { readFileSync } from "node:fs";
import { join } from "node:path";

// Candidate slugs come from the published results in this same commit, so the
// list is right both locally and against staging.
const results = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "backend", "data", "results.json"), "utf8"),
) as { candidates: { slug: string; target: string; period_d: number }[] };

export const CANDIDATES = results.candidates;

export const ROUTES = [
  "/",
  "/candidates",
  `/candidates/${CANDIDATES[0].slug}`,
  "/method",
  "/solar-system",
  "/exoplanets",
  "/exoplanets/toi-700",
  "/missions",
  "/missions/tess",
  "/learn",
  "/classroom",
  "/design-system",
];
