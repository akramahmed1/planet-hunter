"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { apiV2Send, type Schemas } from "@/lib/api-v2";

type Watchlist = Schemas["WatchlistResponse"];
type Alerts = Schemas["AlertSettings"];

/** The signed-in person's watched candidates, and (for teachers) the switch for email alerts. */
export default function MyWatchlist() {
  const [data, setData] = useState<Watchlist | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [problem, setProblem] = useState<{ status: number | null; error: string } | null>(null);
  const [note, setNote] = useState("");
  const [alertNote, setAlertNote] = useState("");

  useEffect(() => {
    let live = true;
    apiV2Send<Watchlist>("GET", "/api/v2/me/watchlist").then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setProblem({ status: r.status, error: r.error });
    });
    // Students get a 403 here: they have a watchlist but no email, so the box is simply absent for them.
    apiV2Send<Alerts>("GET", "/api/v2/me/alerts").then((r) => { if (live && r.ok) setAlerts(r.data); });
    return () => { live = false; };
  }, []);

  async function remove(slug: string, target: string) {
    const r = await apiV2Send<unknown>("DELETE", `/api/v2/me/watchlist/${encodeURIComponent(slug)}`);
    if (r.ok && data) {
      setData({ ...data, watched: data.watched.filter((w) => w.slug !== slug) });
      setNote(`No longer watching ${target}.`);
    } else if (!r.ok) setNote(r.error);
  }

  async function setEmail(on: boolean) {
    setAlertNote("");
    const r = await apiV2Send<Alerts>("PUT", "/api/v2/me/alerts", { email_alerts: on });
    if (r.ok) {
      setAlerts(r.data);
      setAlertNote(on ? "Email alerts are on." : "Email alerts are off.");
    } else setAlertNote(r.error);
  }

  if (problem) {
    return problem.status === 401 || problem.status === 403 || problem.status === 404 ? (
      <EmptyState title="Sign in to keep a watchlist">
        <p>A watchlist is for signed-in teachers and students. <Link href="/classroom">Go to sign in</Link>.</p>
      </EmptyState>
    ) : <p className="error-box" role="alert">Your watchlist could not be loaded ({problem.error}).</p>;
  }
  if (!data) return <p className="muted" role="status">Loading your watchlist...</p>;

  return (
    <>
      {alerts && (
        <section className="card hunt-card" aria-labelledby="alerts-h" data-testid="alert-settings">
          <h2 id="alerts-h" className="card-title">Email alerts</h2>
          <p>
            When the scan data changes, we can email you once about new candidates and about changes to the ones you
            watch. We send nothing when nothing changed. Every email has a link that turns alerts off.
          </p>
          {!alerts.can_email && (
            <p className="muted small">Confirm your email address first (use "Send the email again" in Classroom), then you can switch alerts on.</p>
          )}
          {alerts.can_email && !alerts.email_ready && (
            <p className="muted small">This site cannot send email yet, so switching alerts on will not send anything until it can.</p>
          )}
          <div className="btn-row">
            <button type="button" className="btn" aria-pressed={alerts.email_alerts}
              onClick={() => setEmail(!alerts.email_alerts)} data-testid="alerts-toggle">
              {alerts.email_alerts ? "Turn email alerts off" : "Turn email alerts on"}
            </button>
          </div>
          <p className="muted small" role="status" data-testid="alerts-note">{alertNote}</p>
        </section>
      )}

      {data.watched.length === 0 ? (
        <EmptyState title="You are not watching anything yet">
          <p>Open a candidate and choose Watch this candidate. <Link href="/candidates">See the candidates</Link>.</p>
        </EmptyState>
      ) : (
        <>
          <p className="muted" data-testid="watch-count">{data.watched.length} of {data.limit} watched.</p>
          <ul className="my-scans" data-testid="watchlist">
            {data.watched.map((w) => (
              <li key={w.slug} className="card">
                <p className="eyebrow">{w.label}</p>
                <h2 className="card-title"><Link href={`/candidates/${w.slug}`}>{w.target}</Link></h2>
                <p className="muted small">period {w.period_d.toFixed(4)} days</p>
                <button type="button" className="btn btn--sm" onClick={() => remove(w.slug, w.target)}
                  aria-label={`Stop watching ${w.target}`}>Stop watching</button>
              </li>
            ))}
          </ul>
          <p className="muted small" role="status">{note}</p>
        </>
      )}
    </>
  );
}
