#!/usr/bin/env python3
"""Visual UI/UX QA for the planet-hunter web app.
Screenshots every route at desktop + mobile widths, checks for horizontal
overflow, console errors, and broken images.
Run: /tmp/pwvenv/bin/python qa_visual.py [frontend_url]
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(exist_ok=True)

with __import__("urllib.request").request.urlopen("http://127.0.0.1:8000/api/candidates") as r:
    slugs = [c["slug"] for c in json.load(r)["candidates"]]

ROUTES = [("/", "home"), ("/candidates", "candidates"),
          ("/method", "method")] + [(f"/candidates/{s}", f"detail-{s}") for s in slugs]
VIEWPORTS = {"desktop": {"width": 1440, "height": 900},
             "mobile": {"width": 390, "height": 844}}

issues = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for vname, vp in VIEWPORTS.items():
        ctx = browser.new_context(viewport=vp, device_scale_factor=1)
        pg = ctx.new_page()
        for route, rname in ROUTES:
            errors = []
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            resp = pg.goto(FE + route, wait_until="networkidle")
            status = resp.status if resp else None
            overflow = pg.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
            broken_imgs = pg.evaluate(
                "Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i => i.alt || i.src)")
            pg.screenshot(path=str(OUT / f"{vname}-{rname}.png"), full_page=True)
            tag = f"{vname}{route}"
            if status != 200:
                issues.append(f"{tag}: HTTP {status}")
            if overflow:
                issues.append(f"{tag}: horizontal overflow")
            if broken_imgs:
                issues.append(f"{tag}: broken images {broken_imgs}")
            for e in errors:
                issues.append(f"{tag}: console error: {e[:120]}")
            print(f"shot {tag} status={status} overflow={overflow} imgs={pg.evaluate('document.images.length')}")
        ctx.close()
    browser.close()

print(f"\n{len(issues)} issues")
for i in issues:
    print("ISSUE:", i)
sys.exit(1 if issues else 0)
