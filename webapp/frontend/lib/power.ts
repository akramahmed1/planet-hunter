/**
 * BLS power is a small unitless number (about 0.0001 to 0.01 here), so a fixed two or three decimals shows "0.0"
 * for most of them. This keeps three significant digits at any size: 0.000247, 0.00228, 0.0136.
 * Zero, negative and non-numbers give "n/a" rather than a made-up value.
 */
export function formatPower(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p) || p <= 0) return "n/a";
  if (p >= 1) return p.toPrecision(3);
  const decimals = Math.min(10, 2 - Math.floor(Math.log10(p)));
  return p.toFixed(decimals);
}
