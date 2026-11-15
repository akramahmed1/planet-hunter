"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiV2Send } from "@/lib/api-v2";
import { getRole } from "@/lib/role";
import { EMPTY, LEARN_STORAGE_KEY, load, mergeProgress, parse, sameProgress, save, type Progress } from "@/lib/learn";

/** Where this person's progress lives: only here (not signed in), kept with their account, or waiting to reach it. */
export type SyncState = "local" | "synced" | "waiting";

const PUSH_DELAY_MS = 800;
const RETRY_MS = 20_000;
const URL = "/api/v2/me/learn-progress" as const;

/**
 * Learn progress. The device always keeps its own copy (so it works signed out and offline). For a signed-in teacher
 * or student the copy is also joined with the account's: on load the two are merged both ways, and each change is sent
 * a moment later. A join never loses progress, so devices can sync in any order. The server render and first client
 * render use empty progress so hydration matches; the stored copy is read right after mount and kept in step with
 * other tabs. `saved` is false when storage is blocked.
 */
export function useProgress(): {
  progress: Progress;
  update: (fn: (p: Progress) => Progress) => void;
  ready: boolean;
  saved: boolean;
  sync: SyncState;
} {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [sync, setSync] = useState<SyncState>("local");
  const current = useRef<Progress>(EMPTY);
  const account = useRef(false); // true once the account answered, so changes are sent
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);

  const adopt = useCallback((next: Progress) => {
    if (sameProgress(next, current.current)) return;
    current.current = next;
    setProgress(next);
    setSaved(save(next));
  }, []);

  const push = useCallback(async () => {
    clearTimeout(timer.current);
    if (!account.current) return;
    const r = await apiV2Send<unknown>("PUT", URL, current.current);
    if (!alive.current) return;
    if (r.ok) {
      adopt(mergeProgress(current.current, parse(JSON.stringify(r.data)))); // another device may have added something
      setSync("synced");
    } else {
      setSync("waiting");
      timer.current = setTimeout(push, RETRY_MS);
    }
  }, [adopt]);

  useEffect(() => {
    alive.current = true;
    current.current = load();
    setProgress(current.current);
    setReady(true);
    // Ask the account, but only when someone is signed in: a guest (or Classroom being off) keeps progress on this
    // device only, and does not make a request that is bound to fail.
    (async () => {
      if (!(await getRole())) return;
      const r = await apiV2Send<unknown>("GET", URL);
      if (!alive.current || !r.ok) return;
      account.current = true;
      const server = parse(JSON.stringify(r.data));
      const merged = mergeProgress(current.current, server);
      adopt(merged);
      if (sameProgress(merged, server)) setSync("synced");
      else await push();
    })();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LEARN_STORAGE_KEY) return;
      current.current = load();
      setProgress(current.current);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && timer.current) void push(); // leaving: send what is waiting now
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [adopt, push]);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(current.current);
    if (next === current.current) return;
    current.current = next;
    setProgress(next);
    setSaved(save(next));
    if (account.current) {
      setSync("waiting");
      clearTimeout(timer.current);
      timer.current = setTimeout(push, PUSH_DELAY_MS);
    }
  }, [push]);

  return { progress, update, ready, saved, sync };
}
