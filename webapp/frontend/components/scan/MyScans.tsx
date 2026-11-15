"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { apiV2Send, type SavedScans } from "@/lib/api-v2";

const STATUS: Record<string, string> = { queued: "Waiting in the queue", running: "Scanning", succeeded: "Finished", failed: "Failed" };

/** The signed-in person's saved scans, newest first, each with where it is now and a way to remove it. */
export default function MyScans() {
  const [data, setData] = useState<SavedScans | null>(null);
  const [problem, setProblem] = useState<{ status: number | null; error: string } | null>(null);
  const [gone, setGone] = useState("");

  useEffect(() => {
    let live = true;
    apiV2Send<SavedScans>("GET", "/api/v2/me/saved-scans").then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setProblem({ status: r.status, error: r.error });
    });
    return () => { live = false; };
  }, []);

  async function remove(id: number) {
    const r = await apiV2Send<unknown>("DELETE", `/api/v2/me/saved-scans/${id}`);
    if (r.ok && data) {
      setData({ ...data, scans: data.scans.filter((s) => s.scan_id !== id) });
      setGone("Removed from your list.");
    } else if (!r.ok) setGone(r.error);
  }

  if (problem) {
    // Not signed in (401), the wrong kind of account (403) or Classroom switched off (404): the same friendly answer.
    return problem.status === 401 || problem.status === 403 || problem.status === 404 ? (
      <EmptyState title="Sign in to keep a list of your scans">
        <p>Saved scans are for signed-in teachers and students. <Link href="/classroom">Go to sign in</Link>.</p>
      </EmptyState>
    ) : <p className="error-box" role="alert">Your saved scans could not be loaded ({problem.error}).</p>;
  }
  if (!data) return <p className="muted" role="status">Loading your list...</p>;
  if (data.scans.length === 0) {
    return <EmptyState title="Nothing saved yet"><p>Open a scan and choose Save this scan. <Link href="/scan">Scan a star</Link>.</p></EmptyState>;
  }
  return (
    <>
      <p className="muted" data-testid="my-scans-count">{data.scans.length} of {data.limit} saved.</p>
      <ul className="my-scans" data-testid="my-scans">
        {data.scans.map((s) => (
          <li key={s.scan_id} className="card">
            <p className="eyebrow">{STATUS[s.status] ?? s.status}</p>
            <h2 className="card-title">
              <Link href={`/scan/${s.scan_id}`}>{s.label ?? (s.toi ?? `TIC ${s.tic_id}`)}</Link>
            </h2>
            <p className="muted small">
              {s.toi ?? `TIC ${s.tic_id}`}
              {s.period_d != null && ` · period ${s.period_d.toFixed(4)} days`}
              {s.snr != null && ` · SNR ${s.snr.toFixed(1)}`}
              {` · saved ${new Date(s.saved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
            </p>
            <button type="button" className="btn btn--sm" onClick={() => remove(s.scan_id)}
              aria-label={`Remove ${s.label ?? s.toi ?? `TIC ${s.tic_id}`} from my list`}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="muted small" role="status">{gone}</p>
    </>
  );
}
