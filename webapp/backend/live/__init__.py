"""Live data layer for /api/v2: external fetches, the cache, and bundled reference data.

Rules (plan section 4): every value carries a source and a kind; an upstream
failure serves the last good copy marked stale, never an empty page.
"""
