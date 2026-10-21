# Launch task plan (scope B: everything before launch)

Decided with Akram, 2026-10-21. Goal: the whole app works well on Chrome on a phone, and on a laptop or desktop, with every feature, BEFORE production is touched. Each task is small, and goes through the same loop. Difficulty is judged on technical risk and on how much of the app it can break:
- **Easy (E):** copy, styling or config. Little can break. About an hour.
- **Medium (M):** new component or route, or a small backend change. Tests needed. A few hours.
- **Hard (H):** new data model, heavy visuals, email, or anything touching login. Needs a design note first, tests, and extra review. A day or more.

## The loop (every task, no exceptions)
1. **Branch** from the latest `origin/v2`, one task per branch (`launch/T07-plural-wording`).
2. **Change** only what the task says. Anything else found goes in `docs/QA_LOG.md` as a new task.
3. **Test:** add or update tests for the task (pytest, `test:unit`, or Playwright). Run the full local suite.
4. **Screenshot** (any task that changes what a person sees): the Playwright `screenshots` project captures the touched pages on a Pixel-class phone profile in Chrome (390x844, touch, scale 3) and on a laptop (1440x900), before and after. Check them by eye, then send them to Akram in chat. Real-device checks stay with Akram.
5. **PR** into `v2` with the checklist: what changed, tests added, screenshots, risks.
6. **CI green** on all jobs. Then merge (squash). Never merge red.
7. **Verify on staging** after it deploys (strict staging check, and the task's own check). Log the result in `docs/QA_LOG.md` (found, fixed, retested). Only then start the next task.
If a task fails its tests twice, stop and ask Akram whether to fix it, move it to v2.1, or cut it.

## Tasks
### Phase 0: foundation (do first, everything else leans on it)
| ID | Task | Diff | Notes |
|---|---|---|---|
| T01 | Screenshot suite: Playwright `screenshots` project, every route, phone + laptop, saved as a CI artifact | M | Needed by every later task |
| T02 | `metadataBase` from `NEXT_PUBLIC_SITE_URL` / `RAILWAY_PUBLIC_DOMAIN`; never localhost in production | E | Share cards |
| T03 | CI Postgres version = Railway Postgres (18) | E | Avoid "works in CI only" |
| T04 | `CLASSROOM_ENABLED` flag: server 404s signup/join/class routes when off, UI hides entries; off in production, on in staging | M | Privacy gate |
| T05 | Security automation: CodeQL, `pip-audit`, `npm audit`, secret scanning | E | Reports first, fix findings as tasks |

### Phase 1: quick fixes from the audits
| ID | Task | Diff |
|---|---|---|
| T06 | Plural wording ("1 ambiguous signal", "1 clean recovery") | E |
| T07 | "Select" instead of "Tap" on desktop; "Tap" kept on touch | E |
| T08 | Form field border contrast >= 3:1, plus a test that checks contrast of fields | E |
| T09 | Planet button names (no ".02"/".01"); accessible names on 3D/flat toggles | E |
| T10 | `/hunt` redirect, branded 404 and error pages | E |
| T11 | "Find the dip": explain the start value, nudge to a helpful default; BLS power shown with useful precision; batch scan date and age label | M |
| T12 | Loading states for 3D views (no empty dark panel) | M |
| T13 | Short-height (400x370) and Chromebook (1366x768) sizes in the phone sweep; fix what fails | M |

### Phase 2: explainer and accounts safety
| ID | Task | Diff |
|---|---|---|
| T14 | Explainer spend ledger and $20 monthly cap (reserve worst case before each call; pause quietly at the cap; reset monthly; warn at 80%) | M |
| T15 | Provider adapter: `anthropic` (default), `openai`, `openai_compatible` with base URL; each must pass the 12-case eval | M |
| T16 | Email sender (one provider, key in Railway) for account emails | M |
| T17 | Teacher "forgot password" (single-use expiring token, rate limited) | H |
| T18 | Email verification for teachers | M |
| T19 | Teacher account deletion and a written student data-deletion process (`docs/` + privacy notice wording for Akram's attorney) | M |
| T20 | Teacher 2FA (TOTP, optional) | H |
| T21 | Authorization test expansion: every write route, cross-class and cross-org access, guest vs student vs teacher | M |

### Phase 3: structure
| ID | Task | Diff |
|---|---|---|
| T22 | Three-door entry page (guest, teacher, student); deep links bypass it; remembered choice is a UI preference only | M |
| T23 | Role-based navigation (Classroom shown by role/flag, Systems 3D in main nav) | M |
| T24 | Teacher home (classes, assignments, grades at a glance) | M |
| T25 | Student home (quests, progress, my hunts) | M |
| T26 | Guest mission control home (live status, ISS, picture of the day, space weather) | M |
| T27 | School admin view (organization overview of teachers and classes) | H |

### Phase 4: premium look and 3D (last, because it affects every page)
| ID | Task | Diff |
|---|---|---|
| T28 | Design tokens: glass panels, typography scale, depth, thin glow borders | M |
| T29 | Status strip (UTC clock, ISS position, data freshness) | M |
| T30 | Hero 3D Earth + ISS (three.js, loaded on demand, 200 KB budget kept) | H |
| T31 | Solar System orbit play, zoom to planet | H |
| T32 | Page transitions and number count-up (respect reduced motion) | M |
| T33 | Subtle brand watermark (decorative, off for reduced motion) | E |

### Phase 5: features
| ID | Task | Diff |
|---|---|---|
| T34 | Method page: interactive SVG pipeline diagram with accessible text fallback | M |
| T35 | Linked brushing: light curve and periodogram (uPlot) | H |
| T36 | Sky Atlas: Aladin on every candidate, field of view and target marker | M |
| T37 | Missions telemetry board and ISS ground-track polish | M |
| T38 | CSV export (candidates, scan results, light curve) and per-candidate share links | M |
| T39 | Synced Learn progress for signed-in users (migration, retention rule) | H |
| T40 | Saved scans ("My scans") for signed-in users | H |
| T41 | Watchlist and new-candidate alerts (needs T16 email) | H |
| T42 | Cmd/Ctrl+K command search | M |
| T43 | Explainer UX: "Explain this dip" on candidate and scan pages, grounded and cited | M |

### Phase 6: QA, security and production readiness
| ID | Task | Diff |
|---|---|---|
| T44 | OWASP ZAP baseline scan of staging (Action) | M |
| T45 | Firefox and WebKit Playwright projects for the main flows | M |
| T46 | Load test (k6 in an Action): read endpoints and scan queue | M |
| T47 | Production Postgres with backups, restore drill on staging first, production settings staged (Akram applies) | M |
| T48 | Runbook update and rollback rehearsal | E |
| T49 | FREEZE: no new features. Full launch gate (`docs/HANDOVER.md`) on one release-candidate commit; real-phone pass by Akram; residual-risk list; written approval | M |

## Counts and order of risk
Easy: 12. Medium: 24. Hard: 8 (T17, T20, T27, T30, T31, T35, T39, T40, T41 are the hard ones; T41 depends on T16).
Hard tasks each start with a short design note in the PR (data, failure modes, rollback) and get a second look before merge.
Cut rule: if a Hard task is not green by the freeze date, it moves to v2.1 instead of delaying launch.

## Not in this plan
Stripe checkout, pricing page, pilot sheet and sales material (needs Akram's price and the final privacy notice), the assistant-style copilot that can act (needs an abuse and cost review), district SSO.
