#!/usr/bin/env python3
"""Push the planet-hunter webapp/ folder to akramahmed1/planet-hunter via the
GitHub Git Data API (gh-api helper). Also updates .gitignore for webapp ignores.
Usage: push_webapp.py [message]   (first push: no README live URL yet)
"""
import base64
import json
import subprocess
import sys
from pathlib import Path

GH = "/home/hatch/workspace/skills/github-api/bin/gh-api"
REPO = "akramahmed1/planet-hunter"
LOCAL = Path("/home/hatch/workspace/reverse-engineering/exoplanet-hunt")

# files to push: local path -> repo path
EXCLUDE_DIRS = {"node_modules", ".next", ".venv", "venv", "__pycache__", "screenshots"}
EXCLUDE_SUFFIXES = (".env",)

files = []
webapp = LOCAL / "webapp"
for p in sorted(webapp.rglob("*")):
    if not p.is_file():
        continue
    if any(part in EXCLUDE_DIRS for part in p.parts):
        continue
    if p.name.endswith(EXCLUDE_SUFFIXES) and p.name != "requirements.txt":
        continue
    files.append((p, "webapp/" + str(p.relative_to(webapp))))

# updated .gitignore
GITIGNORE = (
    "# Python\n__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\n\n# data\n*.fits\ndata/\n\n"
    "# webapp\nwebapp/frontend/node_modules/\nwebapp/frontend/.next/\nwebapp/qa/screenshots/\n"
)

MESSAGE = sys.argv[1] if len(sys.argv) > 1 else "Add planet-hunter web app (FastAPI + Next.js) with QA report"


def gh(method, path, data=None):
    cmd = [GH, method, path]
    tmp = None
    if data is not None:
        import tempfile
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(data, tmp)
        tmp.close()
        cmd += ["--data", "@" + tmp.name]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
    finally:
        if tmp:
            import os
            os.unlink(tmp.name)
    if r.returncode != 0:
        raise SystemExit(f"gh-api {method} {path} failed:\n{r.stderr or r.stdout}")
    return json.loads(r.stdout)


print("Reading current main ref...")
ref = gh("GET", f"/repos/{REPO}/git/refs/heads/main")
main_sha = ref["object"]["sha"]
print("main:", main_sha)

blobs = []
for local, repo_path in files:
    raw = local.read_bytes()
    is_text = True
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError:
        is_text = False
    payload = {"content": base64.b64encode(raw).decode(), "encoding": "base64"}
    b = gh("POST", f"/repos/{REPO}/git/blobs", payload)
    blobs.append({"path": repo_path, "mode": "100644", "type": "blob", "sha": b["sha"]})
    print(f"blob {repo_path} ({len(raw)} bytes)")

g = gh("POST", f"/repos/{REPO}/git/blobs",
       {"content": base64.b64encode(GITIGNORE.encode()).decode(), "encoding": "base64"})
blobs.append({"path": ".gitignore", "mode": "100644", "type": "blob", "sha": g["sha"]})

tree = gh("POST", f"/repos/{REPO}/git/trees",
          {"base_tree": main_sha, "tree": blobs})
print("tree:", tree["sha"])

commit = gh("POST", f"/repos/{REPO}/git/commits",
            {"message": MESSAGE, "tree": tree["sha"], "parents": [main_sha]})
print("commit:", commit["sha"])

gh("PATCH", f"/repos/{REPO}/git/refs/heads/main", {"sha": commit["sha"]})
print("Pushed. New main:", commit["sha"])
