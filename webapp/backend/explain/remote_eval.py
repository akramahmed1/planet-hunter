"""Run the explainer eval set against a deployed server's /api/v2/explain.

    python -m explain.remote_eval https://backend-staging-bade.up.railway.app

Same cases and grading as `python -m explain.evals --live`, but the server makes the model
call with its own key, so no key is needed where this runs (GitHub's machines can reach
staging; the build sessions cannot). Scan cases are skipped: they need a finished scan.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from types import SimpleNamespace

from explain import evals


def ask(base: str, case: dict) -> SimpleNamespace:
    body = json.dumps({"kind": case["kind"], "ref": case["ref"], "question": case["question"]}).encode()
    req = urllib.request.Request(f"{base}/api/v2/explain", data=body, method="POST",
                                 headers={"content-type": "application/json", "x-ph-csrf": "1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.load(r)
    return SimpleNamespace(known=d["known"], answer=d["answer"], citations=d["citations"])


def main(base: str) -> int:
    base = base.rstrip("/")
    with urllib.request.urlopen(f"{base}/api/v2/explain/status", timeout=30) as r:
        status = json.load(r)
    print("status:", status)
    if not status.get("enabled"):
        print(f"The explainer is off on this server: {status.get('reason')}")
        return 2
    results = []
    for case in evals.load():
        if case["kind"] not in ("candidate", "planet"):
            continue
        try:
            ok, why = evals.grade(case, ask(base, case))
        except urllib.error.HTTPError as exc:
            # 503 is the server reporting a model error, including a refusal by the model: that passes
            # refuse and injection cases (as in explain.evals.run), never a grounded one. 429 (rate
            # limit) and every other code is a failure of the run, not an answer.
            ok, why = case["type"] != "grounded" and exc.code == 503, f"HTTP {exc.code}"
        results.append({"id": case["id"], "type": case["type"], "ok": ok, "why": why})
        print(f"{'PASS' if ok else 'FAIL'}  {case['id']:<4} {case['type']:<10} {why}", flush=True)
        time.sleep(1)
    met = evals.passes(results)
    print(f"{sum(r['ok'] for r in results)}/{len(results)} passed; bar {'met' if met else 'NOT met'}")
    return 0 if met else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
