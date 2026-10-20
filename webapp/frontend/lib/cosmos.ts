/** Small colour added to the background nebula per section (r, g, b in 0..1), crossfaded on navigation. */
export type Mood = readonly [number, number, number];

const NEUTRAL: Mood = [0, 0, 0];

export function moodFor(path: string | null): Mood {
  const p = path ?? "/";
  if (p.startsWith("/classroom")) return NEUTRAL;
  if (p.startsWith("/candidates") || p.startsWith("/scan")) return [0.06, 0.025, -0.03]; // Hunt: warmer
  if (p.startsWith("/learn")) return [-0.03, 0.055, 0.0]; // Learn: greener
  return [0, 0.008, 0.03]; // everywhere else: the default blue-violet
}
