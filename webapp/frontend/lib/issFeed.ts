"use client";

import { useEffect, useState } from "react";
import { apiV2Get, type Iss } from "@/lib/api-v2";

// One shared poll of the ISS position, so the status strip and the home globe ask once a minute between them.
const POLL_MS = 60_000;

export type IssState = {
  /** undefined: not asked yet; null: unavailable and nothing earlier to show. */
  iss: Iss | null | undefined;
  /** The latest ask failed, so `iss` may be older than it looks. */
  failedSince: boolean;
};

let state: IssState = { iss: undefined, failedSince: false };
const listeners = new Set<(s: IssState) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let generation = 0; // a stop then a quick start must not leave the old chain of asks running

function set(next: IssState) {
  state = next;
  for (const l of listeners) l(state);
}

async function ask(mine: number) {
  if (document.visibilityState === "visible") {
    const r = await apiV2Get<Iss>("/api/v2/iss");
    if (!running || mine !== generation) return;
    if (r.ok) set({ iss: r.data, failedSince: false });
    else set({ iss: state.iss ?? null, failedSince: true }); // keep the last good answer, but say it may be old
  }
  if (running && mine === generation) timer = setTimeout(() => ask(mine), POLL_MS);
}

function start() {
  if (running) return;
  running = true;
  generation += 1;
  void ask(generation);
}

function stop() {
  running = false;
  clearTimeout(timer);
}

export function useIssFeed(): IssState {
  const [s, setS] = useState<IssState>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    start();
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0) stop();
    };
  }, []);
  return s;
}
