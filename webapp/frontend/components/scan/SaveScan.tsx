"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiV2Send } from "@/lib/api-v2";

type State = { saved: boolean; label: string | null };

/**
 * "Save this scan" for a signed-in teacher or student. It asks the server once; when nobody is signed in (or Classroom
 * is off) the server says so and this shows nothing at all, so it never offers something that cannot work.
 */
export default function SaveScan({ id }: { id: number }) {
  const [state, setState] = useState<State | null | undefined>(undefined); // undefined: asking; null: not signed in
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const path = `/api/v2/me/saved-scans/${id}` as const;

  useEffect(() => {
    let live = true;
    apiV2Send<State>("GET", path).then((r) => {
      if (!live) return;
      setState(r.ok ? r.data : null);
      if (r.ok && r.data.label) setLabel(r.data.label);
    });
    return () => { live = false; };
  }, [path]);

  if (!state) return null;

  async function save() {
    setNote("");
    const r = await apiV2Send<State>("PUT", path, { label: label.trim() || null });
    if (r.ok) {
      setState(r.data);
      setNote(state?.saved ? "Label changed." : "Saved to your list.");
    } else setNote(r.error);
  }
  async function remove() {
    setNote("");
    const r = await apiV2Send<State>("DELETE", path);
    if (r.ok) {
      setState(r.data);
      setLabel("");
      setNote("Removed from your list.");
    } else setNote(r.error);
  }

  return (
    <section className="card hunt-card save-scan" aria-labelledby="save-h" data-testid="save-scan">
      <h2 id="save-h" className="card-title">Your list</h2>
      <label className="select-label" htmlFor={`label-${id}`}>
        Label (optional, up to 80 characters; please leave names out)
      </label>
      <input id={`label-${id}`} className="select" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)}
        data-testid="save-label" />
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={save} data-testid="save-button">
          {state.saved ? "Change the label" : "Save this scan"}
        </button>
        {state.saved && <button type="button" className="btn" onClick={remove} data-testid="unsave-button">Remove from my list</button>}
        <Link href="/my-scans" className="btn btn--ghost">My saved scans</Link>
      </div>
      <p className="muted small" role="status" data-testid="save-note">{note}</p>
    </section>
  );
}
