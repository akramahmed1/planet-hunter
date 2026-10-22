"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { apiV2Post, type ScanCreated } from "@/lib/api-v2";

export default function ScanForm() {
  const router = useRouter();
  // Read from the box when the form is sent, not from state: text typed before the page finished loading is on the
  // screen but was never seen by React, and the person is right to expect it to be sent.
  const box = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = box.current?.value ?? "";
    if (!target.trim()) {
      setError("Enter a star to scan.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await apiV2Post<ScanCreated>("/api/v2/scans", { target });
    setBusy(false);
    if (r.ok) router.push(`/scan/${r.data.id}`);
    else setError(r.error);
  }

  return (
    <form onSubmit={submit} className="card scan-form" data-testid="scan-form">
      <label htmlFor={inputId} className="select-label">Star to scan</label>
      <input id={inputId} ref={box} className="select" defaultValue=""
        placeholder="TIC 150428135 or TOI 700" aria-describedby={hintId} maxLength={40}
        autoComplete="off" spellCheck={false} data-testid="scan-target" />
      <p id={hintId} className="muted small">
        A TESS Input Catalog number (TIC) or a TESS Object of Interest number (TOI). Scans take a few minutes; a
        star someone already scanned comes back straight away.
      </p>
      <button type="submit" className="btn btn--primary" disabled={busy} data-testid="scan-submit">
        {busy ? "Queuing..." : "Scan this star"}
      </button>
      {error && <p className="error-box" role="alert" data-testid="scan-error">{error}</p>}
    </form>
  );
}
