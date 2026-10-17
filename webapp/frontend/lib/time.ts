/** "2026-10-17 08:12 UTC". Same output on server and client, so no hydration mismatch. */
export function formatUtc(iso: string): string {
  const s = new Date(iso).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}
