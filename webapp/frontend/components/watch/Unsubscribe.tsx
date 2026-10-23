"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiV2Post } from "@/lib/api-v2";

/**
 * The link in every alert email. The token after the # is read once and removed from the address bar; nothing is
 * changed until the person presses the button, so a mail scanner opening the link cannot turn alerts off.
 */
export default function Unsubscribe() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<"ready" | "working" | "done" | { error: string }>("ready");

  useEffect(() => {
    const m = /(?:^#|&)token=([A-Za-z0-9_-]{20,200})/.exec(window.location.hash);
    setToken(m ? m[1] : null);
    if (m) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function confirm() {
    if (!token) return;
    setState("working");
    const r = await apiV2Post<{ ok: boolean }>("/api/v2/auth/alerts/unsubscribe", { token });
    setState(r.ok ? "done" : { error: r.error });
  }

  if (token === undefined) return <p className="muted" aria-live="polite">One moment...</p>;
  if (state === "done") {
    return (
      <div className="callout" role="status" data-testid="unsub-done">
        <p>Done. You will not get any more alert emails. You can turn them back on any time from <Link href="/my-watchlist">My watchlist</Link>.</p>
      </div>
    );
  }
  if (token === null) {
    return (
      <div className="callout" role="alert" data-testid="unsub-missing">
        <p>This page needs the link from an alert email. You can also switch alerts off in <Link href="/my-watchlist">My watchlist</Link>.</p>
      </div>
    );
  }
  return (
    <div>
      <p>Stop all Planet Hunter alert emails to this address?</p>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={confirm} disabled={state === "working"} data-testid="unsub-confirm">
          Turn off alert emails
        </button>
      </div>
      {typeof state === "object" && (
        <p className="error-box" role="alert" data-testid="unsub-failed">{state.error} The link may be old; you can switch alerts off in <Link href="/my-watchlist">My watchlist</Link>.</p>
      )}
    </div>
  );
}
