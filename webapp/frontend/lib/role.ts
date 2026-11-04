"use client";

// Who is signed in, for the navigation's words only (launch task T23). The answer comes from the server's
// /api/v2/auth/me; nothing here grants anything.
import { useEffect, useState } from "react";
import { roleFromMe, type Role } from "@/components/shell/nav";
import { apiV2Send } from "@/lib/api-v2";

const EVENT = "ph-role";

const FRESH_MS = 30_000;
let cached: { at: number; role: Role } | null = null;
let inflight: Promise<Role> | null = null;

/**
 * Who is signed in. The top bar, the tab bar, the watch button and Learn all need to know, so they share one answer
 * for a short time instead of each asking the server (it used to be three or four calls on every page). Anything
 * other than a signed-in teacher or student, including Classroom being off or the server being unreachable, is null.
 */
export function getRole(): Promise<Role> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.role);
  if (!inflight) {
    inflight = apiV2Send<unknown>("GET", "/api/v2/auth/me").then((r) => {
      inflight = null;
      const role = r.ok ? roleFromMe(r.data) : null;
      cached = { at: Date.now(), role };
      return role;
    });
  }
  return inflight;
}

/** Tell the navigation that the signed-in role changed (sign in, sign out, account deleted). */
export function announceRole(role: Role): void {
  cached = { at: Date.now(), role };
  window.dispatchEvent(new CustomEvent<Role>(EVENT, { detail: role }));
}

/** The role for the navigation, and whether the server has answered yet. Asks nothing while Classroom is switched off. */
export function useSession(enabled: boolean): { role: Role; known: boolean } {
  const [role, setRole] = useState<Role>(null);
  const [known, setKnown] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setRole(null);
      setKnown(true);
      return;
    }
    let live = true;
    getRole().then((r) => {
      if (!live) return;
      setRole(r);
      setKnown(true);
    });
    const onChange = (e: Event) => {
      setRole((e as CustomEvent<Role>).detail ?? null);
      setKnown(true);
    };
    window.addEventListener(EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, [enabled]);
  return { role, known };
}

/** The role for the navigation. Does nothing (and asks nothing) while Classroom is switched off. */
export function useRole(enabled: boolean): Role {
  return useSession(enabled).role;
}
