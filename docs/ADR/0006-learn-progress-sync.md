# ADR 0006: Learn progress follows a signed-in person (launch task T39)

Status: accepted for launch. Decided 2026-10-22.

## Context
Learn progress (steps seen, questions answered, badges) has lived only in the browser's local storage. A student who
moves from a school laptop to a phone starts again, and a teacher cannot rely on a badge staying put. Signed-in people
(teachers with an email, students with a class code, nickname and PIN) already exist; Classroom is off in production
until Akram turns it on, so for now this only does anything where Classroom is on.

## Decision
- One row per person in `learn_progress`: a teacher (`user_id`) or a student (`member_id`), never both (a check
  constraint and two partial unique indexes). The document is the browser's own version 1 shape: lesson names, question
  names, counts, one badge time. It names nobody.
- `GET` and `PUT /api/v2/me/learn-progress`, for either kind of signed-in person, CSRF header required on `PUT`. A
  person only ever reaches their own row (the row is chosen from the session, never from the request). No endpoint
  lets a teacher read a student's document; the class gradebook is unchanged and still comes from `submissions`.
- Sync is a **join**, not "last write wins": the result takes the most progress either copy has (steps: the larger;
  a question: correct if either says correct, tries: the larger; badge time: the earlier). The join is commutative,
  associative and idempotent (tested on both sides with the same 60 cases), so devices can sync in any order and an
  old device that was offline cannot erase newer work. The cost: progress cannot be un-done by syncing (there is no
  "reset my progress" in the app; if one is ever added it must delete the account copy on purpose).
- The browser still keeps its own copy first, so it works signed out and offline. When signed in it merges both ways on
  load and sends changes about 0.8 seconds after they happen (and when the page is hidden); if the account cannot be
  reached it keeps the local copy and tries again every 20 seconds. The page says which of the three states it is in.
- Validation on the server is strict and bounded (at most 64 lessons, 64 questions each, counts capped, badge time must
  be an ISO time): anything else is a 422 and nothing is stored.

## Retention
The row is deleted with its owner (`ON DELETE CASCADE` from `users` and `class_members`: deleting a teacher account,
removing a student or deleting a class removes it) and a row untouched for 24 months is deleted at server start. The 24
months is a proposal marked **ASK** in `docs/DATA_DELETION.md` and the privacy notice draft.

## Rollback
Remove the `useProgress` sync (the hook goes back to local only) and the two routes. The table can stay unused; the
migration's downgrade drops it. Local progress is untouched throughout.
