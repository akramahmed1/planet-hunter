# External data sources

Every outside source v2 depends on, verified with a real request before any
code uses it (plan section 5, Phase 0 task 3). A trimmed sample response for
each source is committed under `webapp/backend/tests/fixtures/external/`.

Nothing in this file is filled in from memory. A field stays `?` until a real
request or the provider's own terms page confirms it.

Status values: `not verified`, `verified`, `flagged for Akram`.

## Summary

| Source | Used for | Status | Fixture |
|---|---|---|---|
| NASA Planetary Fact Sheet (NSSDCA) | Planet temperatures, sizes, orbital distances | not verified | — |
| JPL Horizons API | Today's planet and spacecraft positions, Earth distances | not verified | — |
| JPL Keplerian elements (approximate positions) | Date slider between refreshes (`computed`) | not verified | — |
| NASA Exoplanet Archive TAP | Exoplanets, host stars, equilibrium temperatures, new confirmations | not verified | — |
| MAST | RA/Dec for TIC targets | not verified | — |
| ISS position API | Live ISS position | not verified | — |
| api.nasa.gov: APOD | Picture of the day | not verified | — |
| api.nasa.gov: DONKI | Space weather | not verified | — |
| CDS Aladin Lite / HiPS | Sky map imagery | not verified | — |
| NASA 3D Resources | TESS and spacecraft models | not verified | — |

## Blocker (2026-10-17)

The build session's network policy refuses connections to every host below,
so no request has been made yet. Once the hosts are allowed, each section is
filled in from a real response.

## Per-source details

Each section records: endpoint URL, HTTPS support, auth, rate limit, terms
and attribution, response shape, and the fixture file.

### NASA Planetary Fact Sheet (NSSDCA)
- Host: `nssdc.gsfc.nasa.gov`
- Endpoint: ?
- HTTPS: ? · Auth: ? · Rate limit: ? · Terms/attribution: ?
- Response shape: ?
- Fixture: —

### JPL Horizons API
- Host: `ssd.jpl.nasa.gov`
- Endpoint: ?
- HTTPS: ? · Auth: ? · Rate limit: ? · Terms/attribution: ?
- Response shape: ?
- Fixture: —

### JPL Keplerian elements for approximate positions
- Host: `ssd.jpl.nasa.gov`
- Document: ?
- Validity range and stated accuracy: ?
- Terms/attribution: ?
- Fixture: —

### NASA Exoplanet Archive TAP
- Host: `exoplanetarchive.ipac.caltech.edu`
- Endpoint and tables: ?
- HTTPS: ? · Auth: ? · Rate limit: ? · Terms/attribution: ?
- Response shape: ?
- Fixture: —

### MAST
- Host: `mast.stsci.edu`
- Endpoint: ?
- HTTPS: ? · Auth: ? · Rate limit: ? · Terms/attribution: ?
- Response shape: ?
- Fixture: —

### ISS position API
- Candidate host: `api.wheretheiss.at` (must serve HTTPS; pick another if not)
- Endpoint: ?
- HTTPS: ? · Auth: ? · Rate limit: ? · Terms/attribution: ?
- Response shape: ?
- Fixture: —

### api.nasa.gov: APOD and DONKI
- Host: `api.nasa.gov`
- Endpoints: ?
- HTTPS: ? · Auth: API key in `NASA_API_KEY` (Railway variable, never in git) · Rate limit: ? · Terms/attribution: ?
- Response shape: ?
- Fixtures: —

### CDS Aladin Lite / HiPS
- Hosts: `aladin.cds.unistra.fr`, `alasky.cds.unistra.fr`
- Script/CSS URL and version: ?
- Survey(s) used: ?
- Terms/attribution: ?
- Fixture: — (client-side library; record the version and a HiPS `properties` file instead)

### NASA 3D Resources
- Host: `science.nasa.gov`
- TESS model URL and format: ?
- License: ?
- Decision: use the NASA model, or a procedural model if the license or format doesn't fit.
