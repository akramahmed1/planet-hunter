# 0005: Accounts are for ages 13 and up at launch

Status: Accepted · Date: 2026-10-17

## Context

Planet Hunter targets high school and college. Accounts for children under
13 in the US fall under COPPA, which needs parental-consent or school-consent
flows that are out of scope for launch. The public explorer (no account)
collects no personal data.

## Decision

- At launch, accounts (teacher and student) are for ages 13 and up.
- Sign-up asks for age in a neutral way (for example, birth year from a
  list), not a pre-ticked "I am 13+" box. Under-13 answers are blocked with
  a friendly message, and the app doesn't let the same browser simply retry
  with a different answer during that session.
- Only the outcome (`age_confirmed_13_plus` and its timestamp) is stored, not
  the birth year.
- Students give no email and no real name: class code, nickname and PIN only.
  There is no free-text sharing between students.
- Anonymous explorer use stays account-free, with progress kept on the device.
- The privacy notice and terms are drafts until an attorney reviews them,
  and that review happens before charging schools.
- Supporting under-13 users is a separate, later decision with its own ADR.

## Consequences

- Teachers with under-13 students can't use classroom features yet.
- The exact age-screen wording and any school-consent path go to attorney
  review along with the privacy notice.
