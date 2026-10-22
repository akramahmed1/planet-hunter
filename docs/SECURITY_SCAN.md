# Security scan and load test of staging (T44, T46)

Both run only against STAGING, from GitHub Actions (this build environment cannot reach staging).

## OWASP ZAP baseline (T44) - `.github/workflows/zap-baseline.yml`
- Passive scan: ZAP browses the staging frontend and reads responses for missing security headers, cookie flags,
  information leaks and similar. It does not attack, log in or change anything.
- Starts by hand (Actions, "Security scan"), weekly, and when its own files change on v2.
- Output: an HTML and JSON report kept for 30 days as the `zap-report` artifact. The run fails only on a High-risk alert.
- Results so far (first run, 2026-10-22, run 39822193785 on commit a4957dc, against the staging FRONTEND only, which was
  serving an older build): 83 URLs read, **0 FAIL, 7 WARN, 61 PASS**. Nothing High. Alerts:
  - Medium: CSP `script-src` and `style-src` 'unsafe-inline' (Next.js inline scripts; fixing needs per-request nonces;
    accepted for launch, in `.zap/rules.tsv`), Sub Resource Integrity missing (the pinned CDS Aladin script; accepted).
  - Low: Cross-Origin-Embedder/Opener/Resource-Policy headers missing (COEP would break the sky and map tiles; accepted),
    `X-Powered-By: Next.js` header (FIXED in this change with `poweredByHeader: false`), Unix timestamp disclosure
    (not secret; accepted).
  - Informational: cache-control and storable-content notes (pages are per request on purpose; accepted).
  - NOT covered by that run: the backend API's own headers, anything behind sign-in, and the fixed build. Re-run the
    scan on the release candidate and read it again.
- What a passive scan does NOT cover: logged-in pages, the API's authorization (that is the authorization matrix test),
  injection attempts. These need a person or a longer authenticated scan; list them in the residual-risk list (T49).

## Load test (T46) - `.github/workflows/loadtest.yml`, scripts in `loadtest/`
- k6, two scripts: `read.js` (ten read endpoints that need no NASA call, up to 20 virtual people for about 2.5 minutes)
  and `scan-queue.js` (10 people asking for the same scan: all must get the same job, reads stay readable, a bad name is
  refused with 422). Pass: under 1% failed requests and 95% under 1.5 s (reads), 2 s (queue).
- It queues at most ONE new scan, so staging's worker and the 5-new-scans-per-hour limit are not used up.
- Results so far (first run, 2026-10-22, run 39822193801 on commit a4957dc, against staging; both scripts PASSED):
  - Read endpoints: 2,284 requests over 2 min 20 s, up to 20 virtual people (about 16 requests a second), **0 failed**,
    median 10.6 ms, 95th percentile 45.4 ms, slowest 398 ms.
  - Scan queue: 704 rounds from 10 virtual people (2,113 requests), every check passed (same scan returned, status
    readable, bad name refused), 95th percentile 39.4 ms, slowest 827 ms.
  - Read this with care: it is a light, short test of one small staging instance (about 16 to 23 requests a second),
    which shows it does not fall over, not how many visitors production can hold. No test of the explainer or of real
    scans being worked (the worker was not exercised, and the explainer is off on staging). Repeat before real traffic.
