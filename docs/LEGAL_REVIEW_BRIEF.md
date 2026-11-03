# Legal review brief (for Akram's attorney)

Status: prepared by Claude for Akram. This is a factual brief, not legal advice. Nothing here is reviewed by an attorney yet.
Purpose: give the attorney the facts, the open questions and the exact text to review, before Planet Hunter charges schools or turns on Classroom in production.

## Gate

Classroom stays OFF in production (`CLASSROOM_ENABLED` unset) until the attorney signs off on items 1 to 4 below and on the privacy notice (`docs/PRIVACY_NOTICE_DRAFT.md`). Staging keeps it ON for testing.

## 1. Aladin Lite v3 is GPL-3.0

- What the app does: loads `aladin.js` (pinned to 3.8.2) from CDS (`aladin.cds.unistra.fr`) when a user taps "Show the sky around this star". Source: `docs/DATA_SOURCES.md` flag 2.
- The project's own docs say the source is under GPL-3 and invite users to contact CDS if the licence might block their use.
- Question for the attorney: does loading the CDS-hosted script from our page, without distributing a copy, trigger GPL obligations for Planet Hunter's own code? Does a paid classroom plan change the answer?
- Options if the answer is no: (a) keep loading from CDS and get written confirmation from CDS; (b) replace the interactive viewer with a static sky cut-out image (noted in DATA_SOURCES as the fallback); (c) negotiate a licence.
- Also flagged: no Subresource Integrity on the script (accepted in `docs/SECURITY_SCAN.md`).

## 2. DSS sky imagery copyright

- The HiPS properties file names `Digitized Sky Survey - STScI/NASA, Colored & Healpixed by CDS`, with a copyright link to `archive.stsci.edu/dss/copyright.html`. Source: `docs/DATA_SOURCES.md` flag 3.
- CDS terms say commercial use "is subject to rules depending of the origin". The STScI copyright page has not been read yet.
- Question: may DSS imagery be shown in a paid product, and what credit line is required? The app currently shows the source name; the exact credit wording is not reviewed.

## 3. Privacy notice (`docs/PRIVACY_NOTICE_DRAFT.md`)

Open questions already listed in the draft:
- Wording of the age question and under-13 message; whether a school-consent path is needed.
- Teachers' school email notices.
- Retention of audit-log entries that hold student nicknames.
- Parent or guardian deletion requests: response time and identity check.
- Backup retention wording.
- FERPA and state student-privacy laws for US schools.
- Processors named in the notice: OpenStreetMap, CDS Aladin, NASA, and the AI explainer provider (Anthropic by default; the notice must name the provider that is active).
- Watchlist and alert emails (T41): consent, unsubscribe wording.

Other items to confirm:
- Learn-progress retention period: 24 months, marked ASK in the draft.

## 4. Other third-party terms to confirm

- NASA data (TESS via MAST, Exoplanet Archive, APOD, DONKI, JWST): attribution and any use limits. The personal `api.nasa.gov` key's rate limit is not yet confirmed (DATA_SOURCES flag 4).
- Stripe (billing, not live yet): Stripe's terms and the subscription wording on any price page.
- Fonts (Inter, JetBrains Mono): SIL OFL 1.1, licence files are in the repo.

## 5. Disclaimers that need sign-off

See `docs/DISCLAIMERS_DRAFT.md`. It covers candidates versus confirmed planets, the AI explainer, classroom grades, third-party data, and no warranty. It is drafted from the public practice of similar projects (the Zooniverse Planet Hunters TESS FAQ calls every finding a "candidate" until verified and states that volunteer results cannot confirm a planet).

## Questions to answer, in order

1. Is GPL-3 loading of Aladin from CDS acceptable for a paid product? If not, which option in section 1?
2. What DSS credit and use terms apply in a paid product?
3. Privacy notice: the open questions in section 3.
4. Are the disclaimers in `docs/DISCLAIMERS_DRAFT.md` adequate, and which one needs a lawyer's rewrite?
