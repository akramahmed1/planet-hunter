#!/usr/bin/env python3
"""Build the single source of truth the web app serves.

Inputs (all in the repo, all human-reviewable):
  candidate_shortlist.csv      numbers written by candidate_scan.py
  results/annotations.json     human review: classification + readout per target,
                               run metadata, validation facts
  results/method.json          method page copy
  *.png in the repo root       folded plots written by the pipeline

Outputs (committed, served by the backend as-is):
  webapp/backend/data/results.json
  webapp/backend/data/method.json
  webapp/backend/plots/*.png

A target that appears in the CSV but has no annotation is published as
"unreviewed" so a new scan can never silently show a human verdict it never got.

Usage:
  python scripts/build_results.py          # rebuild outputs
  python scripts/build_results.py --check  # exit 1 if outputs are stale (used in CI)

Standard library only, so it runs anywhere the pipeline runs.
"""
from __future__ import annotations

import argparse
import csv
import filecmp
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "candidate_shortlist.csv"
ANNOTATIONS = ROOT / "results" / "annotations.json"
METHOD = ROOT / "results" / "method.json"
OUT_DIR = ROOT / "webapp" / "backend" / "data"
PLOT_OUT = ROOT / "webapp" / "backend" / "plots"

CLASSIFICATIONS = {
    "clean-recovery",
    "eclipsing-binary",
    "ambiguous",
    "marginal",
    "likely-noise",
    "unreviewed",
}
UNREVIEWED_READOUT = (
    "Not yet reviewed by a human. This is a raw pipeline signal: treat it as a "
    "candidate signal that needs professional follow-up, never a discovery."
)


def slugify(target: str) -> str:
    return target.strip().lower().replace(" ", "-")


def load_candidates(ann: dict) -> list[dict]:
    targets = ann["targets"]
    rows = []
    with open(CSV_PATH, newline="") as f:
        for row in csv.DictReader(f):
            target = row["target"].strip()
            a = targets.get(target)
            if a is None:
                a = {
                    "classification": "unreviewed",
                    "classification_label": "Unreviewed",
                    "readout": UNREVIEWED_READOUT,
                    "plot_file": None,
                }
            if a["classification"] not in CLASSIFICATIONS:
                raise SystemExit(f"{target}: unknown classification {a['classification']!r}")
            plot = a.get("plot_file")
            if plot and not (ROOT / plot).is_file():
                raise SystemExit(f"{target}: plot file {plot} is missing from the repo root")
            rows.append(
                {
                    "rank": int(row["rank"]),
                    "target": target,
                    "slug": slugify(target),
                    "tic": row["tic"].strip(),
                    "period_d": float(row["period_d"]),
                    "duration_d": float(row["duration_d"]),
                    "depth_ppm": int(row["depth_ppm"]),
                    "snr": float(row["snr"]),
                    "bls_power": float(row["bls_power"]),
                    "n_cadences": int(row["n_cadences"]),
                    "classification": a["classification"],
                    "classification_label": a["classification_label"],
                    "readout": a["readout"],
                    "plot_url": f"/api/plots/{plot}" if plot else None,
                }
            )
    rows.sort(key=lambda r: r["rank"])
    slugs = [r["slug"] for r in rows]
    if len(slugs) != len(set(slugs)):
        raise SystemExit("duplicate target slugs in candidate_shortlist.csv")
    stale = sorted(set(targets) - {r["target"] for r in rows})
    if stale:
        raise SystemExit(f"annotations.json has targets not in the CSV: {stale}")
    return rows


def build() -> tuple[dict, dict, set[str]]:
    ann = json.loads(ANNOTATIONS.read_text())
    method = json.loads(METHOD.read_text())
    candidates = load_candidates(ann)
    counts = Counter(r["classification"] for r in candidates)
    validation = ann["validation"]
    plots = {r["plot_url"].rsplit("/", 1)[1] for r in candidates if r["plot_url"]}
    plots.add(validation["plot_url"].rsplit("/", 1)[1])
    results = {
        "schema_version": ann["schema_version"],
        "run": ann["run"],
        "honesty": ann["honesty"],
        "validation": validation,
        "summary": {
            "count": len(candidates),
            "by_classification": {c: counts.get(c, 0) for c in sorted(CLASSIFICATIONS)},
        },
        "candidates": candidates,
    }
    return results, method, plots


def dump(obj: dict) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if outputs are stale")
    args = ap.parse_args()

    results, method, plots = build()
    outputs = {OUT_DIR / "results.json": dump(results), OUT_DIR / "method.json": dump(method)}

    if args.check:
        problems = []
        for path, text in outputs.items():
            if not path.is_file() or path.read_text() != text:
                problems.append(f"stale: {path.relative_to(ROOT)}")
        for name in sorted(plots):
            out = PLOT_OUT / name
            if not out.is_file() or not filecmp.cmp(ROOT / name, out, shallow=False):
                problems.append(f"stale plot: {out.relative_to(ROOT)}")
        if problems:
            print("\n".join(problems))
            print("Run: python scripts/build_results.py")
            return 1
        print(f"results up to date ({results['summary']['count']} candidates)")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PLOT_OUT.mkdir(parents=True, exist_ok=True)
    for path, text in outputs.items():
        path.write_text(text)
    for name in plots:
        shutil.copyfile(ROOT / name, PLOT_OUT / name)
    print(f"wrote {len(outputs)} files and {len(plots)} plots "
          f"({results['summary']['count']} candidates)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
