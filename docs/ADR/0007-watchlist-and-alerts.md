# ADR 0007: Watchlist and alert emails (launch task T41, Hard)

Status: accepted for launch. Decided 2026-10-22.

## Context
A teacher who finds a candidate interesting has no way to hear when the scan data changes. Classroom is off in
production until Akram turns it on, and the site cannot send email until Resend, a sending domain and `APP_BASE_URL`
are set (Akram's list), so this only does anything where those exist.

## Decision
- `watchlist`: one row per person (teacher `user_id` or student `member_id`, never both) and candidate slug, at most 20.
  Only published candidates can be watched. The owner comes from the session, never from the request.
- `alert_prefs`: teachers only (students have no email, so no alerts). Default off. Switching on needs a confirmed
  email. Each row has an unsubscribe token.
- `candidate_snapshots`: after each data sync the server stores a snapshot (slug, label, period) and its digest. The
  first run only stores a baseline and sends nothing. A later run with a different digest computes a diff.
- `alert_sends`: primary key (snapshot, user). A send is claimed before it is made, so a repeated run, two server
  copies or a restart cannot email the same person twice for the same change. A failed send is recorded and not
  retried (a missed alert is better than a repeated one). At most 500 emails per run.
- Who gets what: opted-in, verified teachers get "new candidates" and changes to candidates they watch. Nobody gets an
  email when nothing changed. Text is plain, says "candidate signal, not a discovery", and has an unsubscribe link.
- Unsubscribe: link `/alerts/unsubscribe#token=...` (token in the fragment so it is not logged). Opening the page
  changes nothing; a button posts the token (CSRF, rate limited, failed tries recorded). A mail scanner opening the
  link therefore cannot switch alerts off.
- Everything goes with the account (cascade, tested); see `docs/DATA_DELETION.md`.

## Failure modes
- No `APP_BASE_URL`: no email is sent (links would be wrong); logged, not an error.
- Mail provider down: sends are recorded as failed; the next change is a new snapshot and is tried again.
- Startup sync fails: wrapped so the site still starts.

## Rollback
Switch Classroom off (nothing is shown or sent), or set no mail provider. The tables can stay; the migration 0013
downgrade drops them.
