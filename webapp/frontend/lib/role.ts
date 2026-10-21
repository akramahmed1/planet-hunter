"use client";

// Who is signed in, for the navigation's words only (launch task T23). The answer comes from the server's
// /api/v2/auth/me; nothing here grants anything.
import { useEffect, useState } from "react";
import { roleFromMe, type Role } from "@/components/shell/nav";
import { apiV2Send } from "@/lib/api-v2";

const EVENT = "ph-role";

/** Tell the navigation that the signed-in role changed (sign in, sign out, account deleted). */
export function announceRole(role: Role): void {
  window.dispatchEvent(new CustomEvent<Role>(EVENT, { detail: role }));
}

/** The role for the navigation. Does nothing (and asks nothing) while Classroom is switched off. */
export function useRole(enabled: boolean): Role {
  const [role, setRole] = useState<Role>(null);
  useEffect(() => {
    if (!enabled) {
      setRole(null);
      return;
    }
    let live = true;
    apiV2Send<unknown>("GET", "/api/v2/auth/me").then((r) => {
      if (live && r.ok) setRole(roleFromMe(r.data));
    });
    const onChange = (e: Event) => setRole((e as CustomEvent<Role>).detail ?? null);
    window.addEventListener(EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(EVENT, onChange);
    };
  }, [enabled]);
  return role;
}
