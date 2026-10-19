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
