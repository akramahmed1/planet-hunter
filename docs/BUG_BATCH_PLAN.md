# Bug batch: every flaw found by the two browser audits, and what was done (2026-10-28)

Two testers walked the staging site in Chrome. Each claim was checked against the code first. Status key: **Fixed** (in this
batch or in #79), **Not a code bug**, **Needs Akram**, **Later** (with the reason).

## From the second audit (the six "fix first" items)
| # | Finding | Status |
|---|---|---|
| 1 | Picture of the day and space weather return 503 | **Not a code bug.** The staging logs show the key is accepted and NASA itself answers 500, a placeholder image or 503. The cache already keeps the last good copy in Postgres for 30 days (`live/cache.py`); there was no copy because NASA has not answered since. **Fixed here:** an honest empty state ("No earlier copy is saved yet"), a "Check again" button, and a line explaining Unavailable and "May be out of date". |
| 2 | The explainer is off ("no model key is set") | **Needs Akram.** That message appears only when `EXPLAINER_ENABLED=1` is set and the provider's key is missing. Set `ANTHROPIC_API_KEY` on the **staging backend service** (not only on another service), apply, redeploy. |
| 3 | Privacy wording says progress is "never sent to us" | **Fixed in #79.** A quiz answer is sent to be graded, not saved for a guest. Notice still a draft for the attorney. |
| 4 | Scan can be started without signing in | **By design, with limits** (per caller and queue cap). **Fixed in #79:** the caller address now comes from Railway's `X-Real-IP`, not a header the caller can make up. API docs off by default. |
| 5 | Under-13 block only in one tab | **Fixed in #79** (kept in `localStorage`). Cannot stop someone clearing storage. |
| 6 | Points and badges easy to game | Hunt lab: **fixed here**, a score after "Show the answer" says it is practice. Quiz retries stay unlimited on purpose (the lesson explains each answer). **Needs Akram** if retries should be capped. |

## Smaller bugs
| Finding | Status |
|---|---|
| Units setting ignored on the TESS page | **Fixed** (orbit distances follow miles or km; AU shows km). |
| Units dialog says "93 million miles" after choosing km | **Fixed** (the note follows the unit). |
| Header, times and number jumping after load | UTC to local time flip **fixed** (hidden until ready). Counter re-counting **fixed** (once per visit). Header account icon **fixed in #78** (keeps its space). Nav label "Classroom" to "My classes" width change: **Later**. |
| Dates in UTC, "18 days ago" vs 17 locally, "Distances for 2026-10-27" | **Fixed** (age counted in the viewer's day; the Missions and body-sheet dates say "(UTC date)"). |
| Search: "toi700" finds nothing | **Fixed.** |
| Search: TOI finds only the candidate, not the system page | **Fixed** (planetary system entries). |
| Search box moves as results change | **Fixed** (fixed height). |
| Candidates filter not in the address | **Fixed** (`?class=` and `?sort=`, read strictly). |
| "Download these 1 (CSV)" | **Fixed.** |
| SNR sorts lowest first | **Fixed** (SNR and depth start with the biggest). |
| Rank does not follow SNR, unexplained | **Fixed** (a note gives the real formula from `candidate_scan.py`: BLS power x depth penalty x SNR capped at 50). |
| Count printed twice, two headers do not sort though the copy says all | **Fixed** (table caption is screen-reader only; it names the four sortable columns). |
| Guests call watchlist and learn-progress (401) and "who is signed in" 3 to 4 times | **Fixed in #79.** |
| Sky viewer: "Failed to fetch" from its own tracking, gray wedge, black viewer | **Needs Akram:** paste the console errors from an exoplanet page. My sandbox cannot reach CDS. |
| Header see-through | **Fixed in #78.** |
| TESS page shows "Source" twice in a row | **Fixed** ("Source: launch", "Source: target stars"). |
| JWST card has no Status row | **Fixed honestly:** "No sourced status yet" (no source exists in our data; nothing is invented). |
| Solar System footer credits TESS/MAST | **Fixed** (footer follows the page: Horizons for Solar System and Missions). |
| "Welcome back" after a failed sign-in | **Fixed** ("Last time you chose teacher."). The remembered door is only a preference. |
| TOI 175 and TOI 193 look like known planets but are unreviewed | **Needs Akram** (scientific review, not code). |
| Method page lists astropy 8.0.1 and lightkurve 2.6.0 | **Checked, and clarified.** Those versions come from the prototype's own record (`SUMMARY.md`) and describe the batch results. The live scan engine runs the pinned `lightkurve 2.5.1` and `astropy 7.2.2`. The Method page now says which is which. **Needs Akram** to confirm the batch versions if the original environment is still known. |

## From the first audit
| Finding | Status |
|---|---|
| Cold start, 13 s on the first load | **Needs Akram:** check Railway "App Sleeping" is off for the production frontend and backend. |
| Candidate page 177 KB of HTML | **Fixed** (the chart data loads in the browser, about 130 KB less in the page). |
| Brotli missing | **Later:** Railway's edge serves gzip; Cloudflare in front would add it. |
| `/docs`, `/openapi.json` public | **Fixed in #79** (`API_DOCS=1` to turn on). |
| No `robots.txt` or sitemap | **Fixed in #79** (`ALLOW_INDEXING=1` in production). |
| Scan has no door in the nav | **Later:** needs a decision on the name (Hunt vs Scan) and the nav space. |
| No pricing or pilot page | **Needs Akram:** a contact address; pricing numbers are guesses. |
| Header strip and ISS card disagree | **Fixed** (one shared reading; the strip prints one decimal, the board two). |
| Naming: Hunt, Candidate signals, /candidates | **Needs Akram:** pick one name. |
| Sorting scrambles the rank column | **Fixed** (the rank note). |
| Real scan, login pages, under-13, Chromebook, Safari untested | Safari engine covered in CI (WebKit); the rest needs a real device. |
