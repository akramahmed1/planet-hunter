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


PREWARM_HOUR_UTC = 18


def jobs():
    now = clock.now()
    today = now.date()
    # After 18:00 UTC also fetch tomorrow's positions, so the first visitor after midnight finds them warm.
    days = [today] + ([today + timedelta(days=1)] if now.hour >= PREWARM_HOUR_UTC else [])
    for day in days:
        for body in sources.HORIZONS_IDS:
            yield (f"horizons:vectors:{body}:{day}", timedelta(days=30),
                   lambda b=body, d=day: sources.horizons_today(b, d), sources.SRC_HORIZONS)
    yield "exo:count", timedelta(hours=12), sources.exoplanet_count, sources.SRC_EXO
    yield (f"exo:latest:{today}", timedelta(hours=12), lambda: sources.exoplanets_latest(today), sources.SRC_EXO,
           "exo:latest:last")
    yield f"apod:{today}", timedelta(hours=3), sources.apod, sources.SRC_APOD, "apod:last"
    yield f"donki:{today}", timedelta(hours=3), lambda: sources.donki(today), sources.SRC_DONKI, "donki:last"


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    results = [(job[0], cache.refresh(*job)) for job in jobs()]
    for key, ok in results:
        log.info("%s %s", "refreshed" if ok else "FAILED  ", key)
    ok_count = sum(ok for _, ok in results)
    log.info("%d of %d sources refreshed", ok_count, len(results))
    return 0 if ok_count else 1


if __name__ == "__main__":
    sys.exit(main())
