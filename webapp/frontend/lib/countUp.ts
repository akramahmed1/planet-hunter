// The number shown at a moment of a count-up (launch task T32): from 0 up to the real value, easing out so it settles
// gently. Whole numbers only, because every counted figure on the site is a count. The last frame is always the real value.
// Small numbers are not counted at all, and a count never shows "1" on its way up: the label beside it would be plural
// ("1 clean recoveries"), and the site's wording rules do not stop at the final frame.

export const COUNT_UP_MS = 800;
/** Numbers below this just appear: counting to 3 is not a count. */
export const COUNT_UP_FROM = 10;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** The value to show `elapsedMs` into a count-up to `target`. Never above the target, never decreasing. */
export function countUpValue(target: number, elapsedMs: number, durationMs = COUNT_UP_MS): number {
  if (!Number.isFinite(target)) return target;
  if (elapsedMs >= durationMs || target < COUNT_UP_FROM) return target;
  if (elapsedMs <= 0) return 0;
  const v = Math.floor(target * easeOutCubic(elapsedMs / durationMs));
  return v === 1 ? 2 : Math.min(target, v);
}
