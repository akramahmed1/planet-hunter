"""Scan presets (no numpy here, so the API can import them without the science stack).

"standard" matches candidate_scan.py; "validation" matches validate_toi700.py.
"""
PIPELINE_VERSION = "2.0.0"

PRESETS = {
    "standard": {"period_min": 0.5, "period_max": 30.0, "n_periods": 12000, "durations": [0.05, 0.4, 8],
                 "max_sectors": 4},
    "validation": {"period_min": 1.0, "period_max": 40.0, "n_periods": 20000, "durations": [0.05, 0.5, 10],
                   "max_sectors": 4},
}
