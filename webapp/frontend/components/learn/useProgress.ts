"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY, LEARN_STORAGE_KEY, load, save, type Progress } from "@/lib/learn";

/**
 * Learn progress for this device. The server render and first client render use empty
 * progress so hydration matches; the stored copy is read right after mount and kept in
 * step with other tabs. `saved` is false when storage is blocked.
 */
export function useProgress(): {
  progress: Progress;
  update: (fn: (p: Progress) => Progress) => void;
  ready: boolean;
  saved: boolean;
} {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const current = useRef<Progress>(EMPTY);

  useEffect(() => {
    current.current = load();
    setProgress(current.current);
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LEARN_STORAGE_KEY) return;
      current.current = load();
      setProgress(current.current);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(current.current);
    if (next === current.current) return;
    current.current = next;
    setProgress(next);
    setSaved(save(next));
  }, []);

  return { progress, update, ready, saved };
}
