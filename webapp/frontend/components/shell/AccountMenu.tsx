"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { apiV2Send } from "@/lib/api-v2";
import { announceRole } from "@/lib/role";
import { classroomLabel, type Role } from "./nav";

/**
 * The way in and out, in the top bar (only while Classroom is on). Signed out it is a "Sign in" link to the three-door
 * page. Signed in it opens a small menu with the person's Classroom page and "Sign out". It changes words only: the
 * server decides what anyone may do.
 */
export default function AccountMenu({ role, known }: { role: Role; known: boolean }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    await apiV2Send("POST", "/api/v2/auth/logout", {});
    announceRole(null);
    setBusy(false);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const icon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </svg>
  );

  // Until the server has answered, keep the space (so nothing jumps) without claiming either state.
  if (!known) return <span className="btn btn--ghost btn--sm acct-open acct-wait" aria-hidden="true">{icon}</span>;

  if (!role) {
    return (
      <Link href="/welcome" className="btn btn--ghost btn--sm acct-open" aria-label="Sign in" data-testid="account-signin">
        {icon}
        <span className="acct-label">Sign in</span>
      </Link>
    );
  }

  const who = role === "teacher" ? "Teacher" : "Student";
  return (
    <div className="acct" ref={box}>
      <button ref={button} type="button" className="btn btn--ghost btn--sm acct-open" aria-expanded={open} aria-controls={`${id}-menu`}
        aria-label={`Account menu, signed in as ${who.toLowerCase()}`} onClick={() => setOpen((o) => !o)} data-testid="account-button">
        {icon}
        <span className="acct-label">{who}</span>
      </button>
      {open && (
        <div className="acct-menu" id={`${id}-menu`} data-testid="account-menu">
          <p className="acct-who">Signed in as a {who.toLowerCase()}</p>
          <Link href="/classroom" className="acct-item" onClick={() => setOpen(false)} data-testid="account-classroom">
            {classroomLabel(role)}
          </Link>
          <button type="button" className="acct-item" onClick={signOut} disabled={busy} data-testid="account-signout">
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
