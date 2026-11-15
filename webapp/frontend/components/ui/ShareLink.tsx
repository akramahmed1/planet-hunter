"use client";

import { useRef, useState } from "react";
import { shareUrl } from "@/lib/csv";

/**
 * Copy or share the link to this page. The link is the page's own address and nothing else (no tracking, nothing about
 * the viewer). Where copying is not allowed the link is shown selected, ready to copy by hand.
 */
export default function ShareLink({ path, title }: { path: string; title: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    const link = shareUrl(window.location.origin, path);
    setUrl(link);
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("manual");
      setTimeout(() => field.current?.select(), 0);
    }
  }
  async function share() {
    const link = shareUrl(window.location.origin, path);
    try {
      await navigator.share({ title, url: link });
    } catch { /* the person closed the share sheet: nothing to do */ }
  }
  return (
    <div className="share-link" data-testid="share-link">
      <button type="button" className="btn btn--sm" onClick={copy} data-testid="share-copy">Copy link to this page</button>
      {canShare && <button type="button" className="btn btn--sm" onClick={share} data-testid="share-native">Share</button>}
      <span role="status" className="muted small" data-testid="share-status">
        {state === "copied" ? "Link copied." : state === "manual" ? "Copy this link:" : ""}
      </span>
      {state === "manual" && (
        <input ref={field} className="select" readOnly value={url} aria-label="Link to this page" data-testid="share-field" />
      )}
    </div>
  );
}
