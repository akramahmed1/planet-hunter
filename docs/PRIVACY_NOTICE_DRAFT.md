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

## Ages

Accounts are for people aged 13 and up. If you tell us you are younger, we do not create an
account and do not keep your answer.

## Questions for the attorney review

- Wording of the age question and of the under-13 message; whether a school-consent path is
  needed before launch.
- Whether teachers' school email addresses need any further notice.
- Retention: how long a deleted class's audit-log entries are kept (currently indefinitely,
  with nicknames in the entries).
- FERPA and state student-privacy laws for US schools.
