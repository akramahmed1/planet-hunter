# External data sources

Every outside source v2 depends on, checked with a real request before any
code uses it (plan section 5, Phase 0 task 3). Nothing here is filled in from
memory: each fact comes from a real response or from the provider's own page,
fetched on 2026-10-17.

**How the samples were fetched.** The build session can't reach these hosts,
so `scripts/fetch_external_fixtures.py` runs in the **External fixtures**
GitHub Actions workflow and commits the results back. Each sample in
`webapp/backend/tests/fixtures/external/` has a `<name>.meta.json` beside it
with the request URL (keys redacted), HTTP status, kept response headers, size
and fetch time. Re-run the workflow to refresh them.

Status values: `verified`, `flagged for Akram`.

## Summary

| Source | Used for | Status | Sample |
|---|---|---|---|
| NASA Planetary Fact Sheet (NSSDCA) | Planet temperatures, sizes, distances | verified (gap noted) | `nssdca_factsheet.html` |
| JPL Horizons API | Today's planet and spacecraft positions, Earth distances | verified | `horizons_mars_vectors_helio.json`, `horizons_voyager1_observer_earth.json` |
| JPL Keplerian elements | Date slider between refreshes (`computed`) | verified (Pluto gap flagged) | `jpl_approx_pos_elements.html` |
| NASA Exoplanet Archive TAP | Exoplanets, host stars, equilibrium temperatures | verified | `exoplanet_archive_latest.json`, `exoplanet_archive_count.json`, `exoplanet_archive_pscomppars_columns.json` |
| MAST | RA/Dec for TIC targets | verified | `mast_tic_coords.json` |
| ISS position: wheretheiss.at | Live ISS position | verified (chosen) | `iss_wheretheiss.json` |
| ISS position: open-notify | (alternative) | rejected: no HTTPS | `iss_open_notify_https.meta.json` |
| api.nasa.gov APOD | Picture of the day | verified, with a reliability note | `nasa_apod.json` |
| api.nasa.gov DONKI | Space weather | **flagged for Akram** (still down in Phase 2; shape unverified) | `nasa_donki_notifications.meta.json`, `donki_ccmc_notifications.meta.json` |
| CDS Aladin Lite v3 | Sky map viewer | verified (**license flagged**) | `aladin_lite_v3_js.meta.json` |
| CDS HiPS (DSS colored) | Sky imagery | verified (**commercial terms flagged**) | `hips_dss_color_properties.txt` |
| NASA 3D Resources | TESS model | verified | (model not committed yet; see below) |

## Flagged for Akram

1. **DONKI space weather is down for us.** `api.nasa.gov/DONKI/notifications`
   returned HTTP 503 ("upstream connect error … remote connection failure") on
   all six runs (07:49–07:58 UTC, 2026-10-17). DONKI's own host,
   `kauai.ccmc.gsfc.nasa.gov`, was unreachable from GitHub's runners
   ("Network is unreachable", four tries). Options: (a) retry in Phase 2 and ship the tile
   with its stale/unavailable state, (b) use NOAA SWPC instead, which would be
   a new source to verify, or (c) drop the space-weather tile. Recommended: (a).
2. **Aladin Lite is GPL-3.0.** Its docs say: "Aladin Lite source code is
   available under GPL3 license … If you think this license might prevent you
   from using Aladin Lite … please contact us." Loading it from the CDS server
   on a free page is common; with a paid classroom plan (Phase 9), this should
   go to the attorney review, or we ask CDS. A non-GPL fallback would be a
   static sky cut-out image.
3. **DSS sky imagery has its own copyright.** The HiPS `properties` file says
   `obs_copyright = Digitized Sky Survey - STScI/NASA, Colored & Healpixed by CDS`
   with `obs_copyright_url = http://archive.stsci.edu/dss/copyright.html`. CDS's
   terms say commercial use "is subject to rules depending of the origin". That
   STScI page hasn't been read yet; it goes into the same attorney review before
   charging schools.
4. **The personal api.nasa.gov key limit isn't confirmed.** The signup page
   loads its content with JavaScript, so its text couldn't be read. The DEMO_KEY
   response carried `x-ratelimit-limit: 10`. Phase 2 reads the rate-limit headers
   that come back with your key (set in staging) and records the limit.

## Per-source details

### NASA Planetary Fact Sheet (NSSDCA)
- URL: `https://nssdc.gsfc.nasa.gov/planetary/factsheet/` · HTTP 200 · HTTPS · no auth.
- Shape: one HTML table. Rows include Mass (10^24 kg), Diameter (km), Length
  of Day (hours), Distance from Sun (10^6 km), Orbital Period (days) and
  **Mean Temperature (C)**.
- Gap: this page has **mean temperature only**, with no min/max, and no Sun
  column. Phase 2 must fetch the per-body fact sheets for min/max and the Sun,
  and verify them the same way.
- Terms: NASA content guidelines (see NASA 3D Resources below): generally not
  copyrighted; acknowledge NASA as the source; don't imply endorsement.

### JPL Horizons API
- URL: `https://ssd.jpl.nasa.gov/api/horizons.api` · HTTP 200 · HTTPS · no auth.
- Docs: `https://ssd-api.jpl.nasa.gov/doc/horizons.html` (doc version "1.3 (2025 June)").
- Observed `signature.version` in responses: **"1.2"**. The docs say to check
  this field; our parser should assert the version it was built against.
- Shape: JSON `{signature, result}`; `result` is text, and data sits between
  `$$SOE` and `$$EOE`.
  - `EPHEM_TYPE=VECTORS, CENTER=500@10, OUT_UNITS=AU-D` (Mars, heliocentric,
    ecliptic J2000): X/Y/Z, VX/VY/VZ, LT, RG, RR. Sample on 2026-10-17:
    RG = 1.5775 au.
  - `EPHEM_TYPE=OBSERVER, CENTER=500@399, QUANTITIES=19,20` (Voyager 1, `-31`):
    `r` (Sun distance) and `delta` (Earth distance) in au. Sample on 2026-10-17:
    r = 172.063 au, delta = 172.550 au.
- Constants stated in the output: 1 au = 149597870.700 km, c = 299792.458 km/s.
- Rate limit: none stated on the API doc page. We'll keep to a daily cron with
  a handful of requests.

### JPL Keplerian elements (approximate positions)
- URL: `https://ssd.jpl.nasa.gov/planets/approx_pos.html` · HTTP 200 · HTTPS.
  (The old `txt/p_elem_t1.txt` path returns 404; the tables are on this page.)
- Table 1: elements and rates for Mercury–Neptune plus the Earth-Moon
  barycenter, J2000 ecliptic, **valid 1800 AD – 2050 AD**. The page says the
  elements "are not valid outside the given time-interval".
- Stated nominal errors for 1800–2050 (λ arcsec, φ arcsec, ρ 1000 km): Mercury
  15/1/1, Venus 20/1/4, EM Bary 20/8/6, Mars 40/2/25, Jupiter 400/10/600,
  Saturn 600/25/1500, Uranus 50/2/1000, Neptune 10/1/200. Phase 3 tolerances
  come from this table.
- **Gap: no Pluto.** For other dates, Pluto needs another approach. One
  option: cache Horizons positions for Pluto over a date range and interpolate,
  labeled `computed`. Decide in Phase 2.

### NASA Exoplanet Archive TAP
- URL: `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=…&format=json` · HTTP 200 · HTTPS · no auth.
- Table **`pscomppars`** (Planetary Systems Composite Parameters). `pscomp` does
  not exist. Row count on 2026-10-17: **6451**.
- Column facts from `TAP_SCHEMA.columns`: `st_teff` (K), `pl_eqt` (K),
  `pl_orbsmax` (au), `ra`/`dec` (deg), and **`st_lum` is log10(L/L☉)**.
  `rowupdate` and `releasedate` aren't in this table; `disc_pubdate` (YYYY-MM)
  is.
- Gotcha: `select top 5 … order by disc_year desc` returned rows out of
  order. Filter with `where disc_pubdate >= …` and sort on our side.
- Many new planets have null `pl_orbsmax`/`pl_eqt` (for example
  `TIC 237254473 b`), so the `estimate` path in Phase 2 is needed, not optional.
- Terms: please include the acknowledgment "This research has made use of the
  NASA Exoplanet Archive, which is operated by the California Institute of
  Technology, under contract with the National Aeronautics and Space
  Administration under the Exoplanet Exploration Program." and cite
  Christiansen et al. (2025), per `docs/acknowledge.html`.

### MAST
- URL: `https://mast.stsci.edu/api/v0/invoke?request=<json>` · HTTP 200 · HTTPS · no auth.
- Service `Mast.Catalogs.Filtered.Tic`, filter on `ID`. Response
  `{status: "COMPLETE", msg, data, fields, paging}`.
- Sample: TIC 150428135 → RA 97.09679°, Dec −65.57931°; TIC 260128333 → RA
  92.13320°, Dec −59.54113°.
- Rate limit: none stated on the fetched API landing page. This is a one-time
  lookup per target, committed to `results.json` (Phase 4).

### ISS position: wheretheiss.at (chosen)
- URL: `https://api.wheretheiss.at/v1/satellites/25544` · HTTP 200 · HTTPS · no auth.
- Developer page: "Currently requests are limited to roughly 1 per second."
  The backend caches for 5 s (plan Phase 2), so one upstream call serves every
  user.
- Shape: `{name, id, latitude, longitude, altitude, velocity, visibility,
  footprint, timestamp, daynum, solar_lat, solar_lon, units}`, in kilometers by
  default (a `units=miles` parameter is documented).
- `satellites/25544/positions?timestamps=…` (up to 10 timestamps) can draw the
  ground track.
- open-notify was rejected: `https://api.open-notify.org/iss-now.json` refused
  the connection (no HTTPS).

### api.nasa.gov APOD
- URL: `https://api.nasa.gov/planetary/apod?api_key=…` · HTTPS · key in
  `NASA_API_KEY` (Railway variable, never in git).
- Reliability: across 6 runs with DEMO_KEY, 2 returned 200 and 4 returned HTTP
  500 (`{"code":500,"msg":"Internal Service Error"}`). This confirms the
  plan's serve-last-good-copy cache is needed.
- Shape: `{date, explanation, hdurl, media_type, service_version, title, url}`.
  Some days the image belongs to a third party and a `copyright` field
  appears; show that credit when present.
- DEMO_KEY headers: `x-ratelimit-limit: 10`.

### api.nasa.gov DONKI
- See flag 1. No good sample yet; only the failure metadata is committed.

### CDS Aladin Lite v3
- Script: `https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js` · HTTP 200 · HTTPS ·
  `last-modified: Fri, 06 Mar 2026`. For production we pin a specific
  version from the release page rather than `latest`.
- License: GPL-3.0 (see flag 2). The docs ask users to acknowledge Aladin Sky Atlas.

### CDS HiPS: DSS colored
- `https://alasky.cds.unistra.fr/DSS/DSSColor/properties` · HTTP 200 · HTTPS.
- `hips_doi = 10.26093/cds/aladin/ht9n-7r`; copyright as in flag 3.

### NASA 3D Resources
- Hub: `https://science.nasa.gov/3d-resources/` says the assets "are free to
  download and use" and are mirrored on GitHub (`nasa/NASA-3D-Resources`). The
  repo README says the assets "are free and without copyright".
- TESS models in that repo (commit `11ebb4e`):
  - `3D Models/Transiting Exoplanet Survey Satellite (TESS) (A)/…(A).glb`, 206,576 bytes.
  - `3D Models/Transiting Exoplanet Survey Satellite (TESS) (B)/…(B).glb`, 1,693,644 bytes.
  - Model A is small enough for mobile, so Phase 4 uses it, with a procedural
    fallback if it fails to load.
- Usage guidelines (`nasa.gov/nasa-brand-center/images-and-media/`):
  - Acknowledge NASA as the source.
  - Don't imply NASA endorsement.
  - The NASA insignia and logotype are **not** public domain, so v2 won't use
    the NASA logo.
  - For AI: "attribution of the information directly to NASA is not permitted"
    for LLM output, and the insignia may not appear with AI-generated imagery.
    This matters for the Phase 9 explainer: label its answers as AI-generated,
    never as NASA's.

## Phase 2 findings (2026-10-17)

New samples were fetched the same way (the `p2` set in `scripts/fetch_external_fixtures.py`).
`scripts/build_reference_data.py` turns them into `webapp/backend/data/*.v1.json`, and CI fails if
those files are stale.

- **NSSDCA per-body fact sheets** (`nssdca_<body>fact.html`, all 11 returned 200): numeric rows are
  table cells (Earth's page is plain text, which the parser handles). Temperatures are free text
  and differ by body: an average, a range at one site, a temperature at 1 bar, or several solar
  layers. So the API serves each statement with NASA's exact wording in `quote`, and a test checks
  that every quote appears verbatim in the saved page.
- **Equilibrium-temperature estimate**: Cowan & Agol, arXiv:1011.0428, Eq. 9 (read on alphaXiv).
  - Check: with NASA's own Sun temperature and radius and each planet's orbit and Bond albedo,
    it reproduces the NSSDCA black-body temperatures of all eight planets within 0.5%.
  - Pluto does not match (32.3 K computed vs 37.5 K on the sheet), and the sheet does not say how
    its value was derived.
  - For TOI-700 our zero-albedo estimate differs from the archive's published values by up to 7%
    (planet e: 292 K vs 272.9 K); the archive's numbers come from papers with their own
    assumptions. The API only estimates when the archive has no value, and labels it `estimate`.
- **JPL Horizons Pluto table**: Horizons has no Pluto ephemeris before 1800-01-03 ("No ephemeris
  for target Pluto prior to A.D. 1800-JAN-03"). The table runs from 1800-01-04 to 2050-12-09, so
  `/api/v2/positions` accepts that range. Linear interpolation is within about 2,100 km of
  Horizons today.
- **JPL Table 1 accuracy check** against Horizons today: Mercury, Venus, Earth, Mars, Jupiter,
  Saturn and Uranus fall within JPL's nominal errors. Neptune is off by 697,000 km, about 2.3 times
  the nominal figure, which JPL states as typical rather than maximum. The tests allow 3 times the
  nominal error.
- **APOD, two failure modes seen**:
  - A response with HTTP 200 and an error body (`{"code": 500, ...}`). The fetcher treats a
    response without a title as a failure.
  - A placeholder response: the right explanation (comet 67P), but the title "NASA Science" and an
    image link to the NASA logo (`science.nasa.gov/.../nasa-logo@2x.png`). NASA's insignia is not
    public domain, so the tile only shows images hosted on `apod.nasa.gov` and otherwise says the
    image was not shown.
- **DONKI**: still HTTP 503 (one more try, 09:22 UTC). The response shape is therefore still
  **unverified**. The fetcher keeps only items with `messageType` and `messageIssueTime` and drops
  anything else. The tile shows an explicit "unavailable" state, and the staging smoke test
  reports DONKI as a warning until it answers.
- **Failure backoff**: after a failed fetch with nothing cached, the API answers "unavailable"
  for 2 minutes without retrying upstream, so a down service neither slows every page nor gets
  hammered.

## Phase 3 findings (2026-10-17)

Fetched with the `p3` set in `scripts/fetch_external_fixtures.py` (all 12 returned 200).

- **JPL Horizons, Earth-to-body distances**: geocentric vectors with JPL's own range (`RG`) and
  one-way light time (`LT`) columns, plus heliocentric vectors for the same instant, for the Sun,
  Venus, Mars, Jupiter and Neptune (`horizons_<body>_vectors_{geo,helio}_p3.json`, km and s).
  The solar-system page computes distances as the difference of two heliocentric positions;
  `lib/solar.test.ts` checks this against JPL's `RG` and `LT` to 1 part in 10^9 (both are
  geometric states in the same frame, so only JPL's printed digits differ).
- **Deep-space temperature**: 2.72548 ± 0.00057 K, from Fixsen (2009), "The Temperature of the
  Cosmic Microwave Background", ApJ 707, 916, arXiv:0911.1955 (read on alphaXiv: abstract and
  Section 5). Shown as "about 2.7 K" (-455 °F, -270 °C).
  - Cross-check: NASA's WMAP overview page gives sky temperatures of 2.7251 K and 2.7249 K. The
    old `map.gsfc.nasa.gov` CMB pages now redirect there
    (`https://science.nasa.gov/mission/wmap/wmap-overview/`, saved as `nasa_wmap_cmb_tests.html`).
- **Orbit paths** (`/api/v2/orbits`): computed from the same JPL Table 1 elements (Pluto: the
  Horizons table) over one NSSDCA orbital period, 180 samples each. The window is centred on
  J2000 and moved inside 1800 to 2050 where it does not fit: Neptune (165 years) and Pluto
  (248 years, which only just fits in the 251-year table).
- **Tour facts**: generated from the NSSDCA values, never typed in. `lib/tour.test.ts` checks
  every quiz answer against the data, and checks the one worded claim that is not a number
  (Venus's carbon dioxide atmosphere: "96.5% Carbon Dioxide" on the NSSDCA Venus sheet).

## Phase 4 findings (2026-10-18)

Fetched with the `p4` set (19 of 21 returned 200; the two HEASARC TESS pages returned 404 and are not used).

- **MAST TIC v8** for the 8 targets: RA/Dec (J2000), Teff, radius, mass, luminosity and distance,
  built into `data/stars.v1.json`. TOI-700: RA 97.0967866°, Dec -65.5793115°, matching Phase 0.
- **Exoplanet Archive** `pscomppars` for the 8 hosts: 21 planets in 7 systems. TOI-1338 has none
  under hostname `TOI-1338` (our pipeline classifies it as an eclipsing binary). TOI-216's two
  planets are listed as `TOI-216.01` and `TOI-216.02`, and we show the archive's names as given.
- **Habitable zone:** Kopparapu et al. 2014 (arXiv:1404.5292), Eq. 4 and 5 with Table 1's
  1 Earth-mass coefficients, read on alphaXiv. Valid for 2600 to 7200 K; the API flags stars outside.
  For the Sun it gives 0.95 to 1.68 au (conservative). TOI-700 d's average distance (0.164 au) is
  inside the conservative zone (0.159 to 0.309 au) computed from the TIC values.
- **Spacecraft (JPL Horizons, -95 TESS, -170 JWST, -31 Voyager 1, -32 Voyager 2):** geocentric and
  heliocentric range and light time. Cross-check: NASA says Voyager 1 reaches one light-day
  (25.902 billion km) on 2026-11-18; our 2026-10-18 distance is 25.8 billion km (test allows 1%).
- **Launch dates:** Horizons' Voyager 1 header says "1977-Sep-06 Launch ... @ 12:56 UTC", while
  NASA's Voyager 1 page says "launch Sept. 5, 1977". The page shows NASA's date. JWST's launch comes
  from its Horizons header; NASA's Webb page has no status line, so none is shown.
- **TESS facts:** sector size and length, four cameras and pole coverage from MIT's TESS
  Observations page; orbit, launch and the 200,000-star goal from the Horizons TESS header. Every
  quote is checked against the saved page by `build_reference_data.py`.
- **NASA 3D model** (TESS model A, commit `11ebb4e`) is Draco-compressed (`KHR_draco_mesh_compression`).
  The decoder files are copied from three.js 0.186.0 (Apache-2.0) to `public/draco/`.
- **ISS ground track:** `wheretheiss.at/v1/satellites/25544/positions` with 10 timestamps,
  10 minutes apart, cached 10 minutes.
- **OpenStreetMap tiles:** the usage policy requires visible attribution, a Referer header (our
  Referrer-Policy sends the origin) and light use. Fine for staging. For a busy production site, a
  tile provider with a plan may be needed (Phase 10 decision).
- **Aladin Lite** is loaded only when someone taps "Show the sky around this star", from
  `.../api/v3/latest/aladin.js`. Pin a version in Phase 10. The GPL and DSS flags (2 and 3) still apply.
