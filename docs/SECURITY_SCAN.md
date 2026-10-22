# Security scan and load test of staging (T44, T46)

Both run only against STAGING, from GitHub Actions (this build environment cannot reach staging).

## OWASP ZAP baseline (T44) - `.github/workflows/zap-baseline.yml`
- Passive scan: ZAP browses the staging frontend and reads responses for missing security headers, cookie flags,
  information leaks and similar. It does not attack, log in or change anything.
- Starts by hand (Actions, "Security scan"), weekly, and when its own files change on v2.
- Output: an HTML and JSON report kept for 30 days as the `zap-report` artifact. The run fails only on a High-risk alert.
- Results so far: NOT RUN (staging builds are paused). When it has run, triage every alert here: fix it, or accept it in
  `.zap/rules.tsv` with the reason.
- What a passive scan does NOT cover: logged-in pages, the API's authorization (that is the authorization matrix test),
  injection attempts. These need a person or a longer authenticated scan; list them in the residual-risk list (T49).

## Load test (T46) - `.github/workflows/loadtest.yml`, scripts in `loadtest/`
- k6, two scripts: `read.js` (ten read endpoints that need no NASA call, up to 20 virtual people for about 2.5 minutes)
  and `scan-queue.js` (10 people asking for the same scan: all must get the same job, reads stay readable, a bad name is
  refused with 422). Pass: under 1% failed requests and 95% under 1.5 s (reads), 2 s (queue).
- It queues at most ONE new scan, so staging's worker and the 5-new-scans-per-hour limit are not used up.
- Results so far: NOT RUN (staging paused). The numbers will be added here after the first run; no numbers are claimed
  before then. Staging is one small instance, so it says little about production size: T47 and the launch gate should
  repeat it against production-sized settings before real traffic.
