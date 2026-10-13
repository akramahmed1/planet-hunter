#!/usr/bin/env python3
"""planet-hunter backend QA: checks every endpoint against the source files.
Run: python3 qa_backend.py [base_url]  (default http://127.0.0.1:8000)
"""
import csv
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
PROJECT = "/home/hatch/workspace/reverse-engineering/exoplanet-hunt"
FAILURES = []
PASSES = []


def check(name, cond, detail=""):
    (PASSES if cond else FAILURES).append(name)
    if not cond:
        print(f"FAIL: {name} {detail}")


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return r.status, r.headers.get("Content-Type"), r.read()
    except Exception as e:
        code = getattr(e, "code", None)
        if code:
            return code, "error", e.read() if hasattr(e, "read") else b""
        return None, "error", str(e).encode()


# 1. health
s, ct, b = get("/api/health")
check("health/200", s == 200)
d = json.loads(b)
check("health/status-ok", d.get("status") == "ok")

# 2. validation vs SUMMARY.md
s, ct, b = get("/api/validation")
v = json.loads(b)
check("validation/200", s == 200)
check("validation/recovered_period", v["recovered_period_d"] == 16.0509, v.get("recovered_period_d"))
check("validation/published_period", v["published_period_d"] == 16.051, v.get("published_period_d"))
check("validation/error_pct", v["period_error_pct"] == 0.001, v.get("period_error_pct"))
check("validation/sectors", v["sectors"] == 4, v.get("sectors"))
check("validation/cadences", v["n_cadences"] == 62074, v.get("n_cadences"))
check("validation/depth_ppm", v["depth_ppm"] == 2356, v.get("depth_ppm"))
check("validation/no-discovery-labels", "discover" not in v["target"].lower())

# 3. candidates vs parent candidate_shortlist.csv field by field
s, ct, b = get("/api/candidates")
c = json.loads(b)
rows = c["candidates"]
check("candidates/200", s == 200)
check("candidates/count-8", c["count"] == 8 and len(rows) == 8, c.get("count"))
with open(PROJECT + "/candidate_shortlist.csv", newline="") as f:
    src = {r["target"]: r for r in csv.DictReader(f)}
check("candidates/match-csv-targets", set(src) == {r["target"] for r in rows})
for r in rows:
    srow = src[r["target"]]
    check(f"cand/{r['target']}/rank", r["rank"] == int(srow["rank"]))
    check(f"cand/{r['target']}/tic", r["tic"] == srow["tic"])
    check(f"cand/{r['target']}/period", r["period_d"] == float(srow["period_d"]))
    check(f"cand/{r['target']}/depth", r["depth_ppm"] == int(srow["depth_ppm"]))
    check(f"cand/{r['target']}/snr", r["snr"] == float(srow["snr"]))
    check(f"cand/{r['target']}/n_cadences", r["n_cadences"] == int(srow["n_cadences"]))
    check(f"cand/{r['target']}/duration", r["duration_d"] == float(srow["duration_d"]))
check("cand/toi216-ambiguous", any(r["target"] == "TOI 216" and r["classification"] == "ambiguous" for r in rows))
check("cand/toi776-ambiguous", any(r["target"] == "TOI 776" and r["classification"] == "ambiguous" for r in rows))
check("cand/toi1338-binary", any(r["target"] == "TOI 1338" and r["classification"] == "eclipsing-binary" for r in rows))
check("cand/no-discovery-claims", not any("discovery of" in r["readout"].lower() or "new planet" in r["readout"].lower() for r in rows))
check("cand/not-a-discovery-present", any("NOT a discovery" in r["readout"] for r in rows if r["target"] in ("TOI 216", "TOI 776")))

# 4. per-slug detail + 404 edge case
for r in rows:
    s, ct, b = get(f"/api/candidates/{r['slug']}")
    d = json.loads(b)
    check(f"slug/{r['slug']}/200", s == 200, s)
    check(f"slug/{r['slug']}/matches", d["target"] == r["target"] and d["period_d"] == r["period_d"])
s, ct, b = get("/api/candidates/toi-999")
check("slug/unknown-404", s == 404, s)
s, ct, b = get("/api/candidates/")
# FastAPI redirects trailing slash to /api/candidates; 200 after redirect is fine
check("slug/trailing-slash-redirect-ok", s in (200, 307), s)

# 5. method
s, ct, b = get("/api/method")
m = json.loads(b)
check("method/200", s == 200)
check("method/limitations-present", len(m.get("limitations", [])) >= 6, len(m.get("limitations", [])))
check("method/exominer-noted", any("ExoMiner++" in x for x in m.get("limitations", [])))
check("method/roadmap-present", len(m.get("roadmap", [])) >= 5)
check("method/no-discovery-claims", "discovery" not in json.dumps(m).lower() or "announced as discoveries" in json.dumps(m).lower())

# 6. plots: all four files, content type + non-trivial size + byte-identical to source
import hashlib
for f in ("toi700_validation_fold.png", "top1_TIC_260128333_fold.png",
          "top2_TIC_259377017_fold.png", "top3_TIC_55652896_fold.png"):
    s, ct, body = get(f"/api/plots/{f}")
    check(f"plot/{f}/200", s == 200, s)
    check(f"plot/{f}/png", ct == "image/png", ct)
    check(f"plot/{f}/size", len(body) > 100000, len(body))
    with open(PROJECT + "/" + f, "rb") as fh:
        src_bytes = fh.read()
    check(f"plot/{f}/byte-identical", body == src_bytes)
s, ct, b = get("/api/plots/nope.png")
check("plot/unknown-404", s == 404, s)
s, ct, b = get("/api/plots/../../etc/passwd")
check("plot/traversal-404", s == 404, s)

# 7. CORS header present for the frontend origin
req = urllib.request.Request(BASE + "/api/health", headers={"Origin": "http://localhost:3000"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        check("cors/allow-origin", r.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000",
              r.headers.get("Access-Control-Allow-Origin"))
except Exception as e:
    check("cors/allow-origin", False, str(e))

# 8. no em dashes or en dashes in any served text
blob = b""
for path in ("/api/validation", "/api/candidates", "/api/method", "/api/health"):
    s, ct, b = get(path)
    blob += b
check("copy/no-em-or-en-dash", b"\xe2\x80\x94" not in blob and b"\xe2\x80\x93" not in blob)

print(f"\n{PASSES.__len__()} passed, {FAILURES.__len__()} failed")
if FAILURES:
    print("FAILED:", FAILURES)
    sys.exit(1)
print("ALL BACKEND QA CHECKS PASSED")
