"""Cross-match a signal against what is already known about its star.

Sources (all looked up by TIC ID, never by name):
  - NASA Exoplanet Archive pscomppars: confirmed planets
  - NASA Exoplanet Archive toi: TESS Objects of Interest and their TFOPWG dispositions
  - TESS Eclipsing Binary catalog (Prsa et al. 2022)

A match means the periods agree within TOLERANCE, directly or at a simple ratio
(the search often locks onto half or double the true period). The label the
cross-match proposes is always shown as "proposed, not reviewed".
"""
from __future__ import annotations

TOLERANCE = 0.01  # 1% in period
RATIOS = [(1.0, "same period"), (2.0, "double the period"), (0.5, "half the period")]

# TFOPWG dispositions (Exoplanet Archive toi table): CP confirmed planet, KP known planet, PC planet
# candidate, APC ambiguous planet candidate, FP false positive, FA false alarm.
CONFIRMED = {"CP", "KP"}
FALSE = {"FP", "FA"}
CANDIDATE = {"PC", "APC"}

LABELS = {
    "known_planet": "Matches a known planet",
    "known_eclipsing_binary": "Matches a known eclipsing binary",
    "known_false_positive": "Matches a known false positive",
    "toi_candidate": "Matches a TESS planet candidate",
    "harmonic_of_known": "A multiple of a known period",
    "no_match": "No match: unexplained, needs follow-up",
}


def _ratio(signal: float, known: float) -> tuple[float, str] | None:
    for k, words in RATIOS:
        if known and abs(signal - known * k) / (known * k) <= TOLERANCE:
            return k, words
    return None


def crossmatch(period_d: float, planets: list[dict], tois: list[dict], ebs: list[dict], sources: dict) -> dict:
    matches = []
    for p in planets:
        r = _ratio(period_d, p.get("pl_orbper"))
        if r:
            matches.append({"kind": "planet", "name": p["pl_name"], "period_d": p["pl_orbper"], "ratio": r[0],
                            "relation": r[1], "source": sources["planets"]})
    for t in tois:
        r = _ratio(period_d, t.get("pl_orbper"))
        if r:
            matches.append({"kind": "toi", "name": f"TOI {t['toi']}", "period_d": t["pl_orbper"], "ratio": r[0],
                            "relation": r[1], "disposition": t.get("tfopwg_disp"), "source": sources["tois"]})
    for e in ebs:
        r = _ratio(period_d, e.get("period_d"))
        if r:
            matches.append({"kind": "eclipsing_binary", "name": "TESS EB catalog entry", "period_d": e["period_d"],
                            "ratio": r[0], "relation": r[1], "source": sources["ebs"]})

    direct = [m for m in matches if m["ratio"] == 1.0]
    if any(m["kind"] == "planet" or (m["kind"] == "toi" and m["disposition"] in CONFIRMED) for m in direct):
        label = "known_planet"
    elif any(m["kind"] == "eclipsing_binary" for m in matches):
        label = "known_eclipsing_binary"
    elif any(m["kind"] == "toi" and m["disposition"] in FALSE for m in direct):
        label = "known_false_positive"
    elif any(m["kind"] == "toi" and m["disposition"] in CANDIDATE for m in direct):
        label = "toi_candidate"
    elif matches:
        label = "harmonic_of_known"
    else:
        label = "no_match"
    conflict = label == "known_planet" and any(m["kind"] == "eclipsing_binary" for m in matches)
    return {"matches": matches, "proposed_label": label, "label_text": LABELS[label],
            "note": ("A planet and an eclipsing-binary catalog entry share this period; the catalogs disagree, so "
                     "a human should look." if conflict else None),
            "tolerance": TOLERANCE, "reviewed": False}


def as_vetting_row(cm: dict) -> dict:
    """The catalog check as a vetting row, so a known eclipsing binary is flagged with the other tests."""
    ebs = [m for m in cm["matches"] if m["kind"] == "eclipsing_binary"]
    if ebs:
        m = ebs[0]
        return {"id": "known_eb", "name": "Known eclipsing binary", "status": "fail", "value": {"period_d": m["period_d"]},
                "explanation": f"This star is in the TESS Eclipsing Binary catalog with a period of {m['period_d']:.4f} "
                               f"days ({m['relation']} of this signal). The dip is most likely two stars, not a planet."}
    return {"id": "known_eb", "name": "Known eclipsing binary", "status": "pass", "value": None,
            "explanation": "Not in the TESS Eclipsing Binary catalog at this period."}
