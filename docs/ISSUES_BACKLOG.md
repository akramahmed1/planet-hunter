# Issues backlog: fix at the end, after all development is done

Agreed with Akram on 2026-10-21: finish building every launch task first, then work through this list. Anything a task's
own tests catch is still fixed inside that task (CI has to be green to merge); this file is for everything else. Add to
it as you go; tick items off when fixed and say how it was verified.

## Blocked on Railway (nothing can be verified on staging until builds are restored)
- [ ] Run the full staging gate on the latest v2 commit and report real results. Until then every task is logged
      "Staging: NOT verified".
- [ ] Railway incident checklist (`docs/INCIDENT_RAILWAY_2026-10-21.md`): rotate every secret, check for misuse, record the
      date and result. Decide whether to stay on Railway (T47) after their full report.
- [ ] Reconnect the Railway connector (claude.ai connector settings) once Railway says it is safe.

## Open questions and decisions for Akram
- [ ] Should an unconfirmed teacher email block anything (for example creating classes)? Today it blocks nothing.
- [ ] Is the thin "Teacher or student?" line on the home page enough, or a bigger welcome?
- [ ] Email provider account (Resend), verified sending domain, `EMAIL_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`.
- [ ] `TOTP_ENCRYPTION_KEY` for teacher two-step sign-in (only set it once; see the runbook).
- [ ] Attorney review of the privacy notice (questions marked ASK in `docs/PRIVACY_NOTICE_DRAFT.md` and
      `docs/DATA_DELETION.md`): response time for deletion requests, identity check, backup retention, nicknames kept in
      the audit log when a single student or class is removed.
- [ ] AI provider key in Railway, a matching hard spend cap in the provider's console, and the 12 case eval for any
      provider other than the default before it is approved.
- [ ] Vercel: a project is connected to the repo (Hobby plan, no environment variables). Hobby is for non-commercial use;
      the real production site would need a paid plan. Decide with the hosting decision.

## Known issues and loose ends
- [ ] One unexplained failure: `solar.spec` "switching units updates the card" failed once on desktop in a full local run
      and then passed 3 of 3 alone and in the next full run. Error not captured. Watch CI; if it ever repeats, capture it.
- [ ] One more unexplained failure, seen once in a full local run for T30: `phone.spec` "400x370 /exoplanets/toi-700 ...
      tap targets" found the orbit map's bodies at 21x21 px (under 44). It passed 3 of 3 alone, and the page was not
      changed by T30. Likely the map measured before it finished sizing under load. Watch CI; if it repeats, capture it.
- [ ] Candidate page: the small "i" button next to "Batch scan ... (12 days ago)" wraps to its own line on a phone
      (from the T11 age label). Cosmetic.
- [ ] T05a: `sharp` high severity npm audit finding (easy fix). T05b: `postcss` and `next` need Next 16 (design note and a
      full test and screenshot pass).
- [ ] Teacher two-step sign-in has no QR code (key and phone link only).
- [ ] Teacher home has no per-student drill down or charts (the class page keeps its gradebook).
- [ ] Forgot password: a known address does slightly more database work than an unknown one before replying (milliseconds;
      the email itself is sent after the reply). Residual risk, logged under T17.
- [ ] Home globe (T30) is stylised: a grid and the real day and night sides, no continents. A real Earth picture (NASA
      Blue Marble, public domain, with attribution) needs a network that can reach NASA; add it then, as an extra layer
      that falls back to the stylised globe.
- [ ] T36: the sky atlas marker, ring and field of view buttons are tested against a recording stand-in, not the real Aladin
      Lite (CDS is blocked from my sandbox). Someone must look at one candidate page with the real viewer (phone and laptop)
      and confirm the ring and marker draw and the buttons change the field. If a call differs in 3.8.2, fix `mark()` in
      `components/sky/SkyPanel.tsx`.
- [ ] One more single failure in a full local run (batch B1): `classroom.spec` teacher sign-up on the phone setup, "signed-in"
      did not appear within 5 s. It passed 3 of 3 alone straight after. Likely the sign-up (password hashing) is slow when
      several browsers hit the one backend at once; if it ever repeats in CI, raise that wait or find the slow step.
- [ ] Local test tooling notes (not product): Postgres used to stop when its lock file was deleted by hand (fixed in my
      scripts); a `pgrep -f` pattern must never appear in its own command line.

## Always before the freeze (T49)
- [ ] Full launch gate on one release candidate commit (`docs/HANDOVER.md`), real phone pass by Akram, residual risk list,
      written approval. PR #18 stays unmerged until then.
