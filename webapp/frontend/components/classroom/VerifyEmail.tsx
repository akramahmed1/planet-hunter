"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiV2Post } from "@/lib/api-v2";

/** Opens the emailed link: the token after the # is read once, removed from the address bar and sent to the API. */
export default function VerifyEmail() {
  const [state, setState] = useState<"working" | "done" | "missing" | { error: string }>("working");

  useEffect(() => {
    const m = /(?:^#|&)token=([A-Za-z0-9_-]{20,200})/.exec(window.location.hash);
    if (!m) return setState("missing");
    window.history.replaceState(null, "", window.location.pathname);
    let live = true;
    apiV2Post<{ ok: boolean }>("/api/v2/auth/teacher/verify", { token: m[1] }).then((r) => {
      if (live) setState(r.ok ? "done" : { error: r.error });
    });
    return () => { live = false; };
  }, []);

  if (state === "working") return <p className="muted" aria-live="polite">One moment...</p>;
  if (state === "done") {
    return (
      <div className="callout" role="status" data-testid="verify-done">
        <p>Thank you, your email is confirmed. <Link href="/classroom">Go to Classroom</Link>.</p>
      </div>
    );
  }
  return (
    <div className="callout" role="alert" data-testid="verify-failed">
      <p>{state === "missing" ? "This page needs the link from your email." : state.error}{" "}
        <Link href="/classroom">Sign in</Link> and press "Send the email again".</p>
    </div>
  );
}
