// Learn progress, stored on this device (Phase 7) and, for a signed-in person, kept in step with their account (T39).
//
// Shape: per lesson, the steps seen and, per question, whether it was ever answered
// correctly and how many tries it took. A lesson's badge is earned when every one of
// its questions has been answered correctly at least once (retries are fine).
// Pure functions, unit-tested in lib/learn.test.ts; storage access is guarded because
// localStorage can be missing or throw.

export const LEARN_STORAGE_KEY = "ph-learn-v1";

export type QuestionProgress = { correct: boolean; tries: number };
export type LessonProgress = { stepsSeen: number; questions: Record<string, QuestionProgress>; badgeAt?: string };
export type Progress = { version: 1; lessons: Record<string, LessonProgress> };

export const EMPTY: Progress = { version: 1, lessons: {} };

function lesson(p: Progress, slug: string): LessonProgress {
  return p.lessons[slug] ?? { stepsSeen: 0, questions: {} };
}

export function markStep(p: Progress, slug: string, stepIndex: number): Progress {
  const l = lesson(p, slug);
  if (stepIndex + 1 <= l.stepsSeen) return p;
  return { ...p, lessons: { ...p.lessons, [slug]: { ...l, stepsSeen: stepIndex + 1 } } };
}

/** Record one answer. A question stays correct once answered correctly; tries keep counting until then. */
export function recordAnswer(
  p: Progress,
  slug: string,
  key: string,
  correct: boolean,
  allKeys: readonly string[],
  now: () => string = () => new Date().toISOString(),
): Progress {
  const l = lesson(p, slug);
  const prev = l.questions[key] ?? { correct: false, tries: 0 };
  const q = prev.correct ? prev : { correct, tries: prev.tries + 1 };
  const questions = { ...l.questions, [key]: q };
  const done = allKeys.length > 0 && allKeys.every((k) => questions[k]?.correct);
  const badgeAt = l.badgeAt ?? (done ? now() : undefined);
  return { ...p, lessons: { ...p.lessons, [slug]: { ...l, questions, ...(badgeAt ? { badgeAt } : {}) } } };
}

export function correctCount(p: Progress, slug: string, keys: readonly string[]): number {
  const l = lesson(p, slug);
  return keys.filter((k) => l.questions[k]?.correct).length;
}

export function hasBadge(p: Progress, slug: string): boolean {
  return Boolean(p.lessons[slug]?.badgeAt);
}

/** Lessons with a badge, in the order given. */
export function badges(p: Progress, slugs: readonly string[]): string[] {
  return slugs.filter((s) => hasBadge(p, s));
}

export type LessonStatus = "not-started" | "in-progress" | "complete";

export function status(p: Progress, slug: string): LessonStatus {
  if (hasBadge(p, slug)) return "complete";
  const l = p.lessons[slug];
  return l && (l.stepsSeen > 0 || Object.keys(l.questions).length > 0) ? "in-progress" : "not-started";
}

/** Read what was stored, dropping anything that does not have the expected shape. */
export function parse(raw: string | null): Progress {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<Progress>;
    if (data?.version !== 1 || typeof data.lessons !== "object" || data.lessons === null) return EMPTY;
    const lessons: Record<string, LessonProgress> = {};
    for (const [slug, l] of Object.entries(data.lessons)) {
      if (!/^[a-z0-9-]{1,64}$/.test(slug) || typeof l !== "object" || l === null) continue;
      const questions: Record<string, QuestionProgress> = {};
      for (const [k, q] of Object.entries((l as LessonProgress).questions ?? {})) {
        if (/^[a-z0-9_]{1,64}$/.test(k) && typeof q?.correct === "boolean" && Number.isInteger(q?.tries) && q.tries >= 0) {
          questions[k] = { correct: q.correct, tries: q.tries };
        }
      }
      const seen = (l as LessonProgress).stepsSeen;
      const badgeAt = (l as LessonProgress).badgeAt;
      lessons[slug] = {
        stepsSeen: Number.isInteger(seen) && seen >= 0 ? seen : 0,
        questions,
        ...(typeof badgeAt === "string" ? { badgeAt } : {}),
      };
    }
    return { version: 1, lessons };
  } catch {
    return EMPTY;
  }
}

export function load(): Progress {
  try {
    return parse(window.localStorage.getItem(LEARN_STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

/** Returns false when the progress could not be saved (storage blocked); it still applies for this visit. */
export function save(p: Progress): boolean {
  try {
    window.localStorage.setItem(LEARN_STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * A typed number, read leniently: spaces are ignored and a single comma counts as a
 * decimal point ("8,3" is 8.3). Returns null for anything that is not a plain number.
 */
export function parseNumber(input: string): number | null {
  let s = input.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (!s.includes(".") && (s.match(/,/g) ?? []).length === 1) s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** "within 0.2 minutes", for the hint under a numeric question. */
export function toleranceText(tolerance: number, unit: string): string {
  const t = Number.isInteger(tolerance) ? String(tolerance) : String(Number(tolerance.toPrecision(3)));
  return `Answers within ${t} ${unit} count as right.`;
}

/**
 * Combine two copies of the same person's progress: the most progress either has. Commutative, associative and
 * idempotent (the same join the server applies, backend/learn/progress.py), so devices that sync in any order, any
 * number of times, end up with the same thing, and an old copy can never take progress away.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const lessons: Record<string, LessonProgress> = {};
  for (const slug of [...new Set([...Object.keys(a.lessons), ...Object.keys(b.lessons)])].sort()) {
    const la = a.lessons[slug] ?? { stepsSeen: 0, questions: {} };
    const lb = b.lessons[slug] ?? { stepsSeen: 0, questions: {} };
    const questions: Record<string, QuestionProgress> = {};
    for (const k of [...new Set([...Object.keys(la.questions), ...Object.keys(lb.questions)])].sort()) {
      const qa = la.questions[k];
      const qb = lb.questions[k];
      questions[k] = qa && qb ? { correct: qa.correct || qb.correct, tries: Math.max(qa.tries, qb.tries) } : { ...(qa ?? qb) };
    }
    const badgeAt = la.badgeAt && lb.badgeAt ? (la.badgeAt < lb.badgeAt ? la.badgeAt : lb.badgeAt) : (la.badgeAt ?? lb.badgeAt);
    lessons[slug] = { stepsSeen: Math.max(la.stepsSeen, lb.stepsSeen), questions, ...(badgeAt ? { badgeAt } : {}) };
  }
  return { version: 1, lessons };
}

/** True when two copies hold exactly the same progress. */
export function sameProgress(a: Progress, b: Progress): boolean {
  return JSON.stringify(mergeProgress(a, a)) === JSON.stringify(mergeProgress(b, b));
}
