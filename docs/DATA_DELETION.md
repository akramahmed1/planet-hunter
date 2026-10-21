# Data deletion process (draft for Akram and the attorney)

Status: draft, written for launch task T19. Not legal advice and not reviewed by an attorney. Anything marked
**ASK** needs a decision before the production release.

## What is stored, and where

| Person | What we keep | Where |
|---|---|---|
| Teacher | email, password hash, display name, role in each school, 13+ confirmation time, email confirmation time, classes and assignments they made | tables `users`, `memberships`, `classes`, `assignments` |
| Student | nickname, PIN hash, join time, 13+ confirmation time, assignment results | tables `class_members`, `submissions` |
| Either | a session cookie hash (up to 30 days), counters of failed sign-ins keyed by hashes, an audit log of roles, removals, deletions and exports | tables `sessions`, `auth_failures`, `audit_log` |
| Teacher (temporary) | password reset and email confirmation tokens, as hashes (1 hour and 48 hours) | `password_resets`, `email_verifications` |

No student email, real name, birth date, phone number or address is ever collected. The explainer sends no personal
data to its AI provider (page data and the typed question only).

## Who can delete what, by themselves

1. **A teacher deletes their own account**: Classroom page, "Delete my account", password required.
   - Only teacher of a school or group: the school, all its classes, students, assignments and results are deleted
     too, after an explicit confirmation. Its audit log entries are deleted and one record is kept that says a
     deletion happened, with counts only.
   - School has other teachers: another admin must exist first (the app says so). The classes stay, with no creator.
   - School has a paid plan: cancel the plan first (the app says so).
2. **A teacher removes one student** (their results go with them) or **deletes one class** (all its students go).
   The audit log keeps an entry with the nickname. **ASK**: scrub those entries, and after how long?
3. **A student** cannot delete themselves in the app (they have no email to prove who they are). Their teacher does it.

## A parent, guardian, school or teacher asks us to delete data

1. Acknowledge in writing within **2 business days** (**ASK**: attorney to confirm the period; many state student
   privacy laws and FERPA-style school agreements set one).
2. Check who is asking. For a student, the safest route is the school's teacher or admin, who can remove the student
   in the app in under a minute. If the parent writes to us directly, we ask the school (the org admin) to confirm
   which class and nickname, because we cannot tell which child a nickname is. **ASK**: what identity check is
   acceptable.
3. Delete: the teacher or admin removes the student, or an operator runs the steps below.
4. Confirm in writing when done. Say that copies in database backups are removed when the backups expire
   (**ASK**: the hosting provider's backup period; state it here and in the privacy notice).

## Operator steps (only the repository owner, on the production database, with a recent backup, in a transaction)

Use these only when the app cannot be used (for example the teacher account is gone). Replace the numbers.

```sql
begin;
-- 1. Find the student. Look at the nickname, class name and school with the school's admin before deleting.
select m.id, m.nickname, k.name as class, o.name as school
  from class_members m join classes k on k.id = m.class_id join organizations o on o.id = m.org_id
 where m.org_id = :ORG and lower(m.nickname) = lower(:NICK);
-- 2. Delete. Results (submissions) and sessions go with the student.
delete from sessions where member_id = :MEMBER;
delete from class_members where id = :MEMBER and org_id = :ORG;
-- 3. Remove the nickname from the audit log, keeping the fact that something was removed.
update audit_log set detail = detail - 'nickname' where org_id = :ORG and detail ->> 'nickname' = :NICK;
commit;
```

To delete a whole school (the person who ran it cannot): delete its sessions for members, then
`delete from organizations where id = :ORG;` (everything in it cascades), then
`delete from audit_log where org_id = :ORG;` and add one `org.delete` row with counts only. Do not do this for a school
with a paid plan until its Stripe subscription is cancelled.

Write down the date, who asked, what was deleted (counts, not names) and who did it in a private log.

## Known limits (honest list)

- Backups keep deleted data until they expire. **ASK**.
- Audit log entries for a single removed student or class keep the nickname. **ASK**.
- Students have no self-service deletion. Deliberate, because without an email there is no proof of who they are.
- Teachers with unverified emails can still delete their account (they are signed in with a password).
