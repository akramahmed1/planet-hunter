"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiV2Send, type Schemas } from "@/lib/api-v2";
import { getRole } from "@/lib/role";

type State = Schemas["WatchState"];

/**
 * "Watch this candidate" for a signed-in teacher or student. It asks the server once; when nobody is signed in (or
 * Classroom is off) it shows nothing, so it never offers something that cannot work.
 */
export default function WatchButton({ slug, name }: { slug: string; name: string }) {
  const [state, setState] = useState<State | null | undefined>(undefined); // undefined: asking; null: not signed in
  const [note, setNote] = useState("");
  const path = `/api/v2/me/watchlist/${encodeURIComponent(slug)}` as const;

  useEffect(() => {
    let live = true;
    getRole().then((role) => {
      if (!live) return;
      if (!role) { setState(null); return; } // a guest: nothing to ask, nothing to show
      apiV2Send<State>("GET", path).then((r) => { if (live) setState(r.ok ? r.data : null); });
    });
    return () => { live = false; };
  }, [path]);

  if (!state) return null;

  async function toggle() {
    setNote("");
    const r = await apiV2Send<State>(state?.watching ? "DELETE" : "PUT", path);
    if (r.ok) {
      setState(r.data);
      setNote(r.data.watching ? `Watching ${name}.` : `No longer watching ${name}.`);
    } else setNote(r.error);
  }

  return (
    <div className="watch-box" data-testid="watch-box">
      <div className="btn-row">
        <button type="button" className="btn" aria-pressed={state.watching} onClick={toggle} data-testid="watch-button">
          {state.watching ? "Stop watching" : "Watch this candidate"}
        </button>
        <Link href="/my-watchlist" className="btn btn--ghost">My watchlist</Link>
      </div>
      <p className="muted small" role="status" data-testid="watch-note">{note}</p>
    </div>
  );
}
