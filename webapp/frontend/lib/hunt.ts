// "Find the dip": fold a light curve at a guessed period and score the guess
// against the pipeline's answer.

/** Phase in days, centered on t0: in [-P/2, P/2). Same formula as the backend pipeline. */
export function phaseOf(t: number, period: number, t0: number): number {
  const x = (t - t0 + 0.5 * period) % period;
  return (x < 0 ? x + period : x) - 0.5 * period;
}

/** Median flux in nBins equal phase bins (bins with no points are null). */
export function foldBinned(time: number[], flux: number[], period: number, t0: number, nBins = 100): (number | null)[] {
  const buckets: number[][] = Array.from({ length: nBins }, () => []);
  for (let i = 0; i < time.length; i++) {
    const ph = phaseOf(time[i], period, t0) / period + 0.5; // 0..1
    buckets[Math.min(nBins - 1, Math.floor(ph * nBins))].push(flux[i]);
  }
  return buckets.map((b) => {
    if (!b.length) return null;
    const s = [...b].sort((a, c) => a - c);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  });
}

export type Score = {
  points: number; // 0..100
  relativeError: number; // |guess - answer| / answer
  verdict: "exact" | "close" | "harmonic" | "off";
  harmonic: string | null; // e.g. "half", "double"
  message: string;
};

const HARMONICS: [number, string][] = [
  [0.5, "half"],
  [2, "double"],
  [1 / 3, "a third of"],
  [3, "three times"],
];

/**
 * Score a period guess. 100 points within 0.1% of the answer, falling off with the
 * logarithm of the error, 0 beyond 10%. Landing on a simple multiple of the period
 * (half, double, ...) is recognised, because folding there also lines up the dips.
 */
export function scoreGuess(guess: number, answer: number): Score {
  const rel = Math.abs(guess - answer) / answer;
  const points = rel <= 0.001 ? 100 : rel >= 0.1 ? 0 : Math.round((100 * Math.log10(0.1 / rel)) / 2);
  if (rel <= 0.001) {
    return { points, relativeError: rel, verdict: "exact", harmonic: null,
      message: "Spot on: the dips line up into one sharp dip." };
  }
  if (rel <= 0.02) {
    return { points, relativeError: rel, verdict: "close", harmonic: null,
      message: "Close. The dip is there but smeared; nudge the period a little." };
  }
  for (const [k, name] of HARMONICS) {
    if (Math.abs(guess - answer * k) / (answer * k) <= 0.01) {
      return { points: 0, relativeError: rel, verdict: "harmonic", harmonic: name,
        message: `You found ${name} the period. Folding there lines the dips up too, but some folds are empty or doubled.` };
    }
  }
  return { points, relativeError: rel, verdict: "off", harmonic: null,
    message: "Not yet: the dips land in different places, so they wash out. Keep sliding." };
}

/**
 * Points and median curve for the part of the fold within +-halfWidth of the transit
 * (phase as a fraction of the period). Narrow dips at long periods are invisible on the
 * whole orbit, so the lab shows this window by default.
 */
export function foldWindow(time: number[], flux: number[], period: number, t0: number, halfWidth: number, nBins = 60) {
  const xs: number[] = [];
  const ys: number[] = [];
  const buckets: number[][] = Array.from({ length: nBins }, () => []);
  for (let i = 0; i < time.length; i++) {
    const ph = phaseOf(time[i], period, t0) / period;
    if (Math.abs(ph) > halfWidth) continue;
    xs.push(ph);
    ys.push(flux[i]);
    buckets[Math.min(nBins - 1, Math.floor(((ph + halfWidth) / (2 * halfWidth)) * nBins))].push(flux[i]);
  }
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const med = buckets.map((b) => {
    if (!b.length) return null;
    const s = [...b].sort((p, q) => p - q);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  });
  const binOf = (ph: number) => med[Math.min(nBins - 1, Math.floor(((ph + halfWidth) / (2 * halfWidth)) * nBins))];
  return { x: order.map((i) => xs[i]), y: order.map((i) => ys[i]), median: order.map((i) => binOf(xs[i])) };
}
