"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { apiV2Post } from "@/lib/api-v2";

/** The emailed link keeps its token after the # so it is never sent to a server or in a Referer header. We read it
 * once and take it out of the address bar. */
function takeToken(): string {
  const m = /(?:^#|&)token=([A-Za-z0-9_-]{20,200})/.exec(window.location.hash);
  if (m) window.history.replaceState(null, "", window.location.pathname);
  return m ? m[1] : "";
}

export default function ResetPassword() {
  const id = useId();
  const hintId = `${id}-hint`;
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => setToken(takeToken()), []);

  if (token === null) return <p className="muted" aria-live="polite">One moment...</p>;
  if (done) {
    return (
      <div className="callout" role="status" data-testid="reset-done">
        <p>Your password is changed and you are signed out everywhere. <Link href="/classroom">Sign in with the new
          password</Link>.</p>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="callout" role="status" data-testid="reset-missing">
        <p>This page needs the link from your email. <Link href="/classroom">Ask for a new link</Link> with "Forgot
          your password?".</p>
      </div>
    );
  }
  return (
    <form className="card form-card" data-testid="reset-form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      const r = await apiV2Post<{ ok: boolean }>("/api/v2/auth/teacher/reset", { token, password });
      setBusy(false);
      if (r.ok) setDone(true);
      else setError(r.error);
    }}>
      <div className="field">
        <label htmlFor={id} className="field-label">New password</label>
        <input id={id} className="select" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          aria-describedby={hintId} required minLength={10} maxLength={128} autoComplete="new-password"
          data-testid="reset-password" />
        <p id={hintId} className="muted small">At least 10 characters.</p>
      </div>
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={busy} data-testid="reset-submit">
          {busy ? "One moment..." : "Change my password"}
        </button>
      </div>
      {error && <p className="error-box" role="alert" data-testid="form-error">{error}</p>}
    </form>
  );
}
