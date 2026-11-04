"""What changed in the published candidates, and the email that says so. Pure functions: no database, no network.

A snapshot is what the page shows for each candidate: its label and its period. Two snapshots are compared by name
(slug). A candidate that is new is announced to everyone who opted in; a change of label or period is announced to the
people who watch that candidate. Removed candidates are not announced (they do not happen with our data and a missing
page is its own message).
"""
from __future__ import annotations

import hashlib
import json

PERIOD_PLACES = 4  # the page shows periods to 4 decimal places; a change below that is not a change


def snapshot(candidates) -> dict:
    """The comparable shape of the published candidates (anything with slug, target, classification, period_d)."""
    return {c.slug: {"target": c.target, "classification": str(c.classification), "label": c.classification_label,
                     "period_d": round(float(c.period_d), PERIOD_PLACES)} for c in candidates}


def digest(snap: dict) -> str:
    return hashlib.sha256(json.dumps(snap, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def diff(old: dict, new: dict) -> dict:
    """{"new": [slug...], "changed": [{"slug", "what", "before", "after"}...]}; empty lists when nothing changed."""
    added = sorted(set(new) - set(old))
    changed = []
    for slug in sorted(set(new) & set(old)):
        a, b = old[slug], new[slug]
        if a["classification"] != b["classification"]:
            changed.append({"slug": slug, "what": "label", "before": a["label"], "after": b["label"]})
        if a["period_d"] != b["period_d"]:
            changed.append({"slug": slug, "what": "period", "before": f"{a['period_d']:.4f} days", "after": f"{b['period_d']:.4f} days"})
    return {"new": added, "changed": changed}


def has_changes(d: dict) -> bool:
    return bool(d["new"] or d["changed"])


def compose(name: str, base_url: str, unsubscribe_url: str, d: dict, snap: dict, watched: set[str]) -> tuple[str, str] | None:
    """The email for one person, or None when nothing in the change is theirs to hear about."""
    new = d["new"]
    mine = [c for c in d["changed"] if c["slug"] in watched]
    if not new and not mine:
        return None
    lines = [f"Hello {name},", "", "The candidate signals on Planet Hunter have changed since the last update."]
    if new:
        lines += ["", "New candidate signals:"]
        lines += [f"- {snap[s]['target']}: {snap[s]['label']}, period {snap[s]['period_d']:.4f} days. {base_url}/candidates/{s}" for s in new]
    if mine:
        lines += ["", "Changes to candidates on your watchlist:"]
        for c in mine:
            lines.append(f"- {snap[c['slug']]['target']}: {c['what']} was {c['before']}, now {c['after']}. {base_url}/candidates/{c['slug']}")
    lines += ["", "Remember: each of these is a candidate signal that needs professional follow-up, never a discovery.", "",
              "You get this email because you chose to be told when the candidates change. To stop these emails, open "
              f"this link and confirm: {unsubscribe_url}"]
    subject = "New candidate signals on Planet Hunter" if new else "A candidate you watch has changed"
    return subject, "\n".join(lines) + "\n"
