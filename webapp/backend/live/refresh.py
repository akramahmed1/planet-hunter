"""Daily refresh of the live data caches. Run by the Railway cron service:

    python -m live.refresh

Fetches each source now and stores it, so pages read warm caches. A failed
source keeps its last good copy (served as stale). Exits 1 only if every
source failed, which usually means the network or the database is down.
"""
from __future__ import annotations

import logging
import sys
from datetime import timedelta

from live import cache, clock, sources

log = logging.getLogger("planet-hunter.refresh")


def jobs():
    today = clock.today()
    for body in sources.HORIZONS_IDS:
        yield (f"horizons:vectors:{body}:{today}", timedelta(days=30),
               lambda b=body: sources.horizons_today(b, today), sources.SRC_HORIZONS)
    yield "exo:count", timedelta(hours=12), sources.exoplanet_count, sources.SRC_EXO
    yield (f"exo:latest:{today}", timedelta(hours=12), lambda: sources.exoplanets_latest(today), sources.SRC_EXO)
    yield f"apod:{today}", timedelta(hours=3), sources.apod, sources.SRC_APOD
    yield f"donki:{today}", timedelta(hours=3), lambda: sources.donki(today), sources.SRC_DONKI


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    results = [(key, cache.refresh(key, ttl, fetch, src)) for key, ttl, fetch, src in jobs()]
    for key, ok in results:
        log.info("%s %s", "refreshed" if ok else "FAILED  ", key)
    ok_count = sum(ok for _, ok in results)
    log.info("%d of %d sources refreshed", ok_count, len(results))
    return 0 if ok_count else 1


if __name__ == "__main__":
    sys.exit(main())
