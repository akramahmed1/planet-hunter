import { count } from "./plural.ts";
// Small helpers for the classroom pages (Phase 8). Pure, unit-tested in lib/classroom.test.ts.

export type AssignmentKind = "lesson" | "quiz" | "hunt";

/** Where a student goes to do an assignment. */
export function assignmentHref(a: { id: number; kind: AssignmentKind; ref: string }): string {
  if (a.kind === "lesson") return `/learn/${a.ref}`;
  if (a.kind === "quiz") return `/learn/${a.ref}?quiz=1`;
  return `/classroom/hunt/${a.id}`;
}

/** "Oct 20, 3:00 PM" in the viewer's time zone, en-US. */
export function formatDue(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone });
}

/** A date input value (YYYY-MM-DD) as the end of that day in the viewer's time zone, as ISO. */
export function endOfDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d, 23, 59, 0);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** A grade cell as text: "2 / 3", "-" when not started; "late" when finished after the due date. */
export function gradeText(cell: { score: number; max_score: number; completed_at: string | null; late: boolean } | null):
  string {
  if (!cell) return "-";
  const base = `${cell.score} / ${cell.max_score}`;
  if (!cell.completed_at) return `${base} (in progress)`;
  return cell.late ? `${base} (late)` : base;
}

/** True when a classroom load failed because nobody (or the wrong kind of person) is signed in. */
export function needsSignIn(message: string): boolean {
  return /sign in|needs a (teacher|student) account/i.test(message);
}

type Glance = { students: number; assignments: number; expected: number; completed: number; average_percent: number | null;
  next_due: string | null };

/** The short facts shown under a class name, in order. Nothing is guessed: each part is a number the server counted. */
export function glanceParts(k: Glance, timeZone?: string): string[] {
  const parts = [count(k.students, "student")];
  if (k.assignments === 0) {
    parts.push("no assignments yet");
    return parts;
  }
  parts.push(count(k.assignments, "assignment"));
  if (k.expected > 0) parts.push(`${k.completed} of ${k.expected} done`);
  if (k.average_percent !== null) parts.push(`average ${k.average_percent}%`);
  if (k.next_due) parts.push(`next due ${formatDue(k.next_due, timeZone)}`);
  return parts;
}

/** The totals for a whole school or group: sums of the classes' counts, and the soonest due date among them. */
export function schoolTotals(classes: Glance[]) {
  const sum = (f: (k: Glance) => number) => classes.reduce((a, k) => a + f(k), 0);
  const expected = sum((k) => k.expected);
  const completed = sum((k) => k.completed);
  const dues = classes.map((k) => k.next_due).filter((d): d is string => !!d).sort();
  return {
    classes: classes.length,
    students: sum((k) => k.students),
    assignments: sum((k) => k.assignments),
    expected,
    completed,
    percentDone: expected > 0 ? Math.round((100 * completed) / expected) : null,
    nextDue: dues[0] ?? null,
  };
}
