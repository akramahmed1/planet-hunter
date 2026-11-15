"""Seed a finished scan for the offline end-to-end tests (CI and local), no network.

Builds a real result for TIC 260128333 (TOI 1338) from its exported light curve
(data/lightcurves/toi-1338.json), the vetting checks, and the cross-match against
the saved catalog samples, then stores it through the job queue.

    DATABASE_URL=... python seed_demo_scans.py
"""
from __future__ import annotations

import json

import db
from live import reference
from live.fixture_transport import FIXTURES
from pipeline import crossmatch as xm
from pipeline import vetting
from scans import queue
from scans.presets import PIPELINE_VERSION, PRESETS


def main() -> None:
    eng = db.engine()
    d = json.loads((reference.DATA / "lightcurves" / "toi-1338.json").read_text())
    s = d["signal"]
    tic = 260128333
    planets = [p for p in json.loads((FIXTURES / "exoplanet_archive_systems_by_tic_p6.json").read_text())
               if p["tic_id"] == f"TIC {tic}"]
    tois = [t for t in json.loads((FIXTURES / "exoplanet_archive_toi_targets_p6.json").read_text()) if t["tid"] == tic]
    ebs = reference.tess_ebs()
    cm = xm.crossmatch(s["period_d"], planets, tois, ebs["ebs"].get(str(tic), []), {
        "planets": {"name": "NASA Exoplanet Archive (pscomppars)", "url": "https://exoplanetarchive.ipac.caltech.edu/"},
        "tois": {"name": "NASA Exoplanet Archive, TESS Objects of Interest (toi)",
                 "url": "https://exoplanetarchive.ipac.caltech.edu/"},
        "ebs": {"name": ebs["source"]["name"], "url": ebs["source"]["url"]}})
    rows = vetting.vet(d["time_btjd"], [1 + x / 1e6 for x in d["flux_ppm"]], s["period_d"], s["t0_btjd"],
                       s["duration_d"], s["depth_ppm"], reference.stars()["stars"][f"TIC {tic}"]["radius_rsun"])
    rows.insert(0, xm.as_vetting_row(cm))
    params = {"preset": "standard", **PRESETS["standard"]}
    job_id, created = queue.enqueue(eng, tic, params, "seed", "TOI 1338")
    if not created:
        print(f"demo scan {job_id} already present")
        return
    job = queue.claim(eng, "seed")
    run = {"pipeline_version": PIPELINE_VERSION, "sectors": d["sectors"], "n_cadences": d["n_cadences"],
           "lightcurve": {k: d[k] for k in ("source", "processing", "binning", "time_btjd", "flux_ppm")},
           "periodogram": d["periodogram"]}
    queue.complete(eng, job, "seed", run, {**s, "vetting": rows, "crossmatch": cm, "proposed_label": cm["proposed_label"]})
    print(f"seeded demo scan {job_id} (TIC {tic}): {cm['proposed_label']}")


if __name__ == "__main__":
    main()
