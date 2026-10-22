# Planet Hunter privacy notice (DRAFT)

**Status: draft, not reviewed by an attorney. It must be reviewed before Planet Hunter
charges schools or opens accounts in production (ADR 0005).** The same text is shown at
`/privacy` with the same warning.

## Without an account

You can use everything on Planet Hunter except the classroom without an account. We do not
ask who you are. Your settings (units) and lesson progress are kept in your own browser
(local storage) and are never sent to us. The pages load maps, sky images and the picture of
the day from the services named on each page (OpenStreetMap, CDS Aladin, NASA), which receive
your IP address as part of loading them.

Signed in with a teacher or student account, your lesson progress is also kept with your account so it follows you to
your other devices. It holds lesson names, question names, how many tries you took and when a badge was earned, nothing
else. It is deleted when your account (or your class) is deleted, and when it has not been used for 24 months
(**ASK**: attorney and Akram to confirm the period).

## Teacher accounts

We store: your email address, a hash of your password (Argon2id, never the password), the
name you choose to show students, the schools or groups you belong to and your role there,
the classes and assignments you create, and that you confirmed being 13 or older (with the
time, not your birth date).

## Student accounts

Students give no email and no real name. We store: the nickname chosen for the class, a hash
of the PIN, when they joined, that they confirmed being 13 or older (with the time, not the
birth date), and their assignment results. Other students never see a student's nickname or
results; their teachers in the same school or group do.

## Signing in

A random session token is kept in a cookie on your browser for up to 30 days; we store only
a hash of it. Failed sign-in attempts are counted against a hash of the email, the student,
or a hash of the IP address, for up to one day, to slow down guessing.

## Who can see what

- Teachers see the classes of the schools or groups they belong to, and nothing from others.
- Changes to roles, removals, deletions and exports are recorded in an audit log.

## Exporting and deleting

A teacher can export everything stored about a class and its students, and delete a class
with all its students and results. A teacher can remove a single student and their results.
A teacher can delete their own account at any time after typing their password. If they are
the only teacher of a school or group, they are asked to confirm that the school or group
goes too, with its classes, students and results. A school with a paid plan must cancel the
plan first. When a school or group is deleted, its audit log entries (which hold student
nicknames) are deleted as well and one plain record that a deletion happened is kept, with
counts only. A parent, guardian or school can also ask us to delete a student's data; the
steps and the time we commit to are in `docs/DATA_DELETION.md`.

## Ages

Accounts are for people aged 13 and up. If you tell us you are younger, we do not create an
account and do not keep your answer.

## Questions for the attorney review

- Wording of the age question and of the under-13 message; whether a school-consent path is
  needed before launch.
- Whether teachers' school email addresses need any further notice.
- Retention: when a single student is removed or a single class is deleted, the audit-log
  entries about it are kept indefinitely and include the nickname (deleting a whole school
  removes them). Decide whether those entries should also be scrubbed, and after how long.
- Whether deletion requests from parents or guardians must be answered within a set number
  of days, and what identity check we may ask for (see `docs/DATA_DELETION.md`).
- Backups: deleted data stays in database backups until they roll off (the hosting provider's
  backup period; see the process document). Is that wording acceptable?
- FERPA and state student-privacy laws for US schools.
