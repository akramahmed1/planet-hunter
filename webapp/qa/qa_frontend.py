#!/usr/bin/env python3
"""planet-hunter frontend E2E QA. Crawls every route and every candidate detail
page on the production frontend build against a running backend.
Run: python3 qa_frontend.py [frontend_url] [backend_url]
"""
import json
import re
import sys
import urllib.request

FE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
BE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8000"
FAILURES, PASSES = [], []


def check(name, cond, detail=""):
    (PASSES if cond else FAILURES).append(name)
    if not cond:
        print(f"FAIL: {name} {detail}")


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.status, r.headers.get("Content-Type"), r.read()
    except Exception as e:
        code = getattr(e, "code", None)
        if code:
            return code, "error", b""
        return None, "error", str(e).encode()


def page(path):
    s, ct, b = fetch(FE + path)
    check(f"route{path or '/'}/200", s == 200, s)
    return b.decode("utf-8", "replace")


# slugs from backend truth
with urllib.request.urlopen(BE + "/api/candidates", timeout=30) as r:
    cands = json.load(r)["candidates"]
slugs = [c["slug"] for c in cands]
check("backend/exposes-8", len(cands) == 8, len(cands))

pages = ["/", "/candidates", "/method"] + [f"/candidates/{s}" for s in slugs]
seen_links, seen_imgs = set(), set()
for p in pages:
    html = page(p)
    # no fallback error state when backend is up
    check(f"{p}/no-error-box", "error-box" not in html)
    # no placeholder text
    check(f"{p}/no-placeholder", "could not be loaded" not in html)
    # candidate detail pages show their target and classification
    if p.startswith("/candidates/") and p != "/candidates":
        cand = next(c for c in cands if f"/candidates/{c['slug']}" == p)
        check(f"{p}/has-target", cand["target"] in html, cand["target"])
        check(f"{p}/has-period", str(cand["period_d"]) in html)
        check(f"{p}/has-badge", "Ambiguous" in html or "Clean recovery" in html
              or "Eclipsing binary" in html or "Marginal" in html or "Likely noise" in html or "Unreviewed" in html)
    seen_links.update(re.findall(r'href="(/candidates/[^"]*)"', html))
    seen_links.update(re.findall(r'href="(/method|/)"', html))
    seen_imgs.update(re.findall(r'<img[^>]+src="([^"]+)"', html))

check("candidates-page/links-to-all-8",
      {f"/candidates/{s}" for s in slugs} <= seen_links,
      {f"/candidates/{s}" for s in slugs} - seen_links)

# home shows the honesty banner and validation numbers
home = page("/")
check("home/banner", "Candidate, not discovery" in home)
check("home/validation-numbers", "16.0509" in home and "62,074" in home)

# candidates list page shows all 8 rows
lst = page("/candidates")
check("list/all-8", all(c["target"] in lst for c in cands))

# method page carries limitations + roadmap + exoMiner honesty
mp = page("/method")
check("method/limitations", "False positives dominate" in mp)
check("method/exominer", "ExoMiner++" in mp)
check("method/never-discoveries", "never announced as discoveries" in mp)

# all internal links resolve
for l in sorted(seen_links):
    s, _, _ = fetch(FE + l)
    check(f"link{l}/200", s == 200, s)

# all images load as real PNGs with non-trivial size
check("images/found", len(seen_imgs) > 0, seen_imgs)
for i in sorted(seen_imgs):
    url = i if i.startswith("http") else BE + i if i.startswith("/api") else FE + i
    s, ct, b = fetch(url)
    check(f"img{url.replace(BE, '').replace(FE, '')}/200-png", s == 200 and ct == "image/png", (s, ct))
    check(f"img/size-non-trivial", len(b) > 100000, len(b))

# no em/en dashes anywhere in rendered copy
blob = "".join([home, lst, mp] + [page(p) for p in [f"/candidates/{s}" for s in slugs]])
check("copy/no-em-or-en-dash", "\u2014" not in blob and "\u2013" not in blob)
check("copy/toi216-ambiguous-labeled", "NOT a discovery" in page("/candidates/toi-216"))
check("copy/toi175-correction-labeled", "NOT a discovery" in page("/candidates/toi-175"))

print(f"\n{len(PASSES)} passed, {len(FAILURES)} failed")
if FAILURES:
    print("FAILED:", FAILURES)
    sys.exit(1)
print("ALL FRONTEND E2E CHECKS PASSED")
