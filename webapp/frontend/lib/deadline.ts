// A deadline for the page server's own calls to the API. Without one, a page that waits on the live tiles stays open
// for as long as the slowest NASA call takes (seen on staging: 16 to 47 s, with NASA retrying), so the page never
// finishes loading. With one, a slow source shows its "Unavailable, check again" state instead.
export const SERVER_DEADLINE_MS = 8000;
export const TILES_DEADLINE_MS = 4000;

/** `init` with a time limit added when the call runs on the server and the caller set none. */
export function withDeadline(init: RequestInit | undefined, ms: number, onServer: boolean): RequestInit | undefined {
  if (!onServer || init?.signal) return init;
  return { ...init, signal: AbortSignal.timeout(ms) };
}
