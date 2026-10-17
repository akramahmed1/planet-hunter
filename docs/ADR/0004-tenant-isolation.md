# 0004: Classroom data is isolated by `org_id`, enforced in one place

Status: Accepted · Date: 2026-10-17

## Context

Phase 8 adds schools (organizations), classes, teachers and students in one
shared database. A teacher in one school must never see another school's
students or grades. Students are 13+ and sign in with a class code, a
nickname and a PIN, without email.

## Decision

- Every classroom table carries a non-null `org_id`: `memberships`,
  `classes`, `class_members`, `assignments`, `submissions`, `audit_log`.
- Child rows reference parents by `(org_id, id)` composite foreign keys, so
  the database rejects a row that points at another org's parent.
- One FastAPI dependency resolves the caller into a principal (user, org,
  role: `org_admin`, `teacher` or `student`). Every classroom endpoint
  requires it and declares the roles it allows.
- Queries go through a small data-access layer that takes the principal and
  always adds the `org_id` filter. Route code never builds an unscoped
  classroom query.
- A row in another org returns 404, not 403, so its existence isn't leaked.
- Role changes, deletes and exports write to `audit_log`.
- Student PINs are stored hashed, never in plain text.

Postgres row-level security was considered as an extra layer. It is not
adopted now, to keep migrations and tests simple; it can be added later
without changing the schema.

## Consequences

- Tests must show that org A can't read, list or modify org B's data, and
  that a student can't call teacher endpoints (Phase 8 "Done when").
- Every new classroom endpoint must use the shared dependency; a test checks
  that each classroom route declares it.
