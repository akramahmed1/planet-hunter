"""Catalog lookups for scans: TOI to TIC, star radius, and the cross-match sources.

All lookups go through live.http (timeouts, retries) and live.cache (last good copy),
and are keyed by TIC ID.
"""
from __future__ import annotations

import json
import re
from datetime import timedelta

from live import cache, http, reference
from live.sources import TAP
from pipeline import crossmatch as xm

MAST = "https://mast.stsci.edu/api/v0/invoke"
SRC_ARCHIVE = {"name": "NASA Exoplanet Archive (pscomppars)", "url": "https://exoplanetarchive.ipac.caltech.edu/"}
SRC_TOI = {"name": "NASA Exoplanet Archive, TESS Objects of Interest (toi)",
           "url": "https://exoplanetarchive.ipac.caltech.edu/"}
SRC_MAST = {"name": "MAST TESS Input Catalog", "url": "https://mast.stsci.edu/api/v0/"}

TIC_RE = re.compile(r"^\s*(?:TIC(?:\s+|-)?)?(\d{1,10})\s*$", re.I)
TOI_RE = re.compile(r"^\s*TOI[\s-]*(\d{1,5})(?:\.(\d{1,2}))?\s*$", re.I)


class BadTarget(ValueError):
    pass


def _tap(query: str) -> list[dict]:
    rows = http.get_json(TAP, {"query": query, "format": "json"})
    if not isinstance(rows, list):
        raise http.FetchError("Exoplanet Archive returned an error")
    return rows


def resolve(target: str) -> tuple[int, str | None]:
    """'TIC 150428135', '150428135', 'TOI 700', 'TOI-700.01' -> (TIC ID, TOI or None)."""
    if m := TIC_RE.match(target or ""):
        tic = int(m.group(1))
        if tic <= 0:
            raise BadTarget("TIC IDs are positive numbers")
        return tic, None
    if m := TOI_RE.match(target or ""):
        pfx = int(m.group(1))
        try:
            hit = cache.cached(f"toi:prefix:{pfx}", timedelta(days=1),
                               lambda: _tap(f"select tid,toi from toi where toipfx = {pfx}"), SRC_TOI)
        except cache.Unavailable as exc:
            raise http.FetchError("the TOI list is unavailable right now") from exc
        if not hit.payload:
            raise BadTarget(f"TOI {pfx} is not in the TESS Objects of Interest list")
        return int(hit.payload[0]["tid"]), f"TOI {pfx}"
    raise BadTarget("Enter a TIC ID (like TIC 150428135) or a TOI number (like TOI 700).")


class LiveCatalogs:
    """What a scan needs to know about its star, looked up live (cached)."""

    def star_radius(self, tic: int) -> float | None:
        req = {"service": "Mast.Catalogs.Filtered.Tic", "format": "json",
               "params": {"columns": "ID,rad", "filters": [{"paramName": "ID", "values": [str(tic)]}]}}
        try:
            hit = cache.cached(f"mast:tic:rad:{tic}", timedelta(days=30),
                               lambda: http.get_json(MAST, {"request": json.dumps(req)}), SRC_MAST)
        except cache.Unavailable:
            return None
        rows = (hit.payload or {}).get("data") or []
        return rows[0].get("rad") if rows else None

    def crossmatch(self, tic: int, period_d: float) -> dict:
        def planets():
            return _tap(f"select pl_name,pl_orbper from pscomppars where tic_id = 'TIC {tic}'")

        def tois():
            return _tap(f"select toi,pl_orbper,tfopwg_disp from toi where tid = {tic}")

        out = {}
        for name, fn, src in (("planets", planets, SRC_ARCHIVE), ("tois", tois, SRC_TOI)):
            try:
                out[name] = cache.cached(f"xm:{name}:{tic}", timedelta(days=1), fn, src).payload
            except cache.Unavailable:
                out[name] = None
        ebs = reference.tess_ebs()
        result = xm.crossmatch(period_d, out["planets"] or [], out["tois"] or [], ebs["ebs"].get(str(tic), []),
                               {"planets": SRC_ARCHIVE, "tois": SRC_TOI,
                                "ebs": {"name": ebs["source"]["name"], "url": ebs["source"]["url"]}})
        missing = [k for k in ("planets", "tois") if out[k] is None]
        if missing:
            result["note"] = (result["note"] or "") + f" Could not reach: {', '.join(missing)}; matches may be missing."
        return result
