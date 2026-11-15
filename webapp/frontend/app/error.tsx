"use client";

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page crashes while it is being drawn. The reason stays in the server log (the digest
// below points to it); the visitor sees a plain message and a way forward, never a stack trace.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="page">
      <p className="eyebrow">Something went wrong</p>
      <h1>This page hit a problem</h1>
      <p className="lede">
        It is on our side, not yours. Try again, or go back to the home page. If it keeps happening, the
        results service may be busy; it usually clears within a few minutes.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn">
          Go to the home page
        </Link>
      </div>
      {error.digest && <p className="muted small">Reference: {error.digest}</p>}
    </div>
  );
}
