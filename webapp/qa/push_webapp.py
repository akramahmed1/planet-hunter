#!/usr/bin/env python3
"""Push the planet-hunter webapp/ folder to akramahmed1/planet-hunter via the
GitHub Git Data API (gh-api helper), building trees bottom-up so nested
subdirectories are created correctly. Also updates .gitignore.
Usage: push_webapp.py [message]
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

GH = "/home/hatch/workspace/skills/github-api/bin/gh-api"
REPO = "akramahmed1/planet-hunter"
LOCAL = Path("/home/hatch/workspace/reverse-engineering/exoplanet-hunt")

EXCLUDE_DIRS = {"node_modules", ".next", ".venv", "venv", "__pycache__", "screenshots"}
EXCLUDE_SUFFIXES = (".env",)

GITIGNORE = (
    "# Python\n__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\n\n# data\n*.fits\ndata/\n\n"
    "# webapp\nwebapp/frontend/node_modules/\nwebapp/frontend/.next/\nwebapp/qa/screenshots/\n"
)

MESSAGE = sys.argv[1] if len(sys.argv) > 1 else "Add planet-hunter web app (FastAPI + Next.js) with QA report"


def gh(method, path, data=None):
    cmd = [GH, method, path]
    tmp = None
    if data is not None:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(data, tmp)
        tmp.close()
        cmd += ["--data", "@" + tmp.name]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
    finally:
        if tmp:
            os.unlink(tmp.name)
    if r.returncode != 0:
        raise SystemExit(f"gh-api {method} {path} failed:\n{r.stderr or r.stdout}")
    return json.loads(r.stdout)


def gh_blob(raw: bytes) -> str:
    return gh("POST", f"/repos/{REPO}/git/blobs",
              {"content": base64.b64encode(raw).decode(), "encoding": "base64"})["sha"]


def build_tree(base_sha: str | None, entries: list[dict]) -> str:
    payload = {"tree": entries}
    if base_sha:
        payload["base_tree"] = base_sha
    return gh("POST", f"/repos/{REPO}/git/trees", payload)["sha"]


print("Reading current main ref...")
ref = gh("GET", f"/repos/{REPO}/git/refs/heads/main")
main_sha = ref["object"]["sha"]
print("main:", main_sha)

# nested dict: dir -> {name: (kind, value)} kind = blob (raw bytes) or tree
root: dict = {}


def put(tree: dict, parts: list, raw: bytes):
    if len(parts) == 1:
        tree[parts[0]] = ("blob", raw)
    else:
        sub = tree.setdefault(parts[0], ("tree", {}))[1]
        put(sub, parts[1:], raw)


webapp = LOCAL / "webapp"
count = 0
for p in sorted(webapp.rglob("*")):
    if not p.is_file():
        continue
    if any(part in EXCLUDE_DIRS for part in p.parts):
        continue
    if p.name.endswith(EXCLUDE_SUFFIXES) and p.name != "requirements.txt":
        continue
    raw = p.read_bytes()
    put(root, ["webapp"] + list(p.relative_to(webapp).parts), raw)
    count += 1
put(root, [".gitignore"], GITIGNORE.encode())
print(f"staged files: {count}")


def push_tree(node: dict) -> str:
    entries = []
    for name, (kind, val) in sorted(node.items()):
        if kind == "blob":
            sha = gh_blob(val)
        else:
            sha = push_tree(val)
            kind = "tree"
        entries.append({"path": name, "mode": "100644" if kind == "blob" else "040000",
                        "type": kind, "sha": sha})
        print(f"  {'blob' if kind == 'blob' else 'tree'} {name}")
    return build_tree(None, entries)


print("Building webapp subtree bottom-up...")
webapp_sha = push_tree(root["webapp"][1])
print("webapp tree:", webapp_sha)

# final root tree: keep existing files, replace .gitignore and webapp/
gitignore_sha = gh_blob(GITIGNORE.encode())
final = gh("POST", f"/repos/{REPO}/git/trees", {
    "base_tree": main_sha,
    "tree": [
        {"path": ".gitignore", "mode": "100644", "type": "blob", "sha": gitignore_sha},
        {"path": "webapp", "mode": "040000", "type": "tree", "sha": webapp_sha},
    ],
})
root_tree_sha = final["sha"]
print("root tree:", root_tree_sha)

commit = gh("POST", f"/repos/{REPO}/git/commits",
            {"message": MESSAGE, "tree": root_tree_sha, "parents": [main_sha]})
print("commit:", commit["sha"])
gh("PATCH", f"/repos/{REPO}/git/refs/heads/main", {"sha": commit["sha"]})
print("Pushed. New main:", commit["sha"])
