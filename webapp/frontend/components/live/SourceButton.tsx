"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Badge from "@/components/ui/Badge";
import Sheet from "@/components/ui/Sheet";
import type { SourceRef } from "@/lib/api-v2";
import { formatUtc } from "@/lib/time";

type Kind = "measured" | "computed" | "estimate";

const KIND_TEXT: Record<Kind, string> = {
  measured: "Measured: taken directly from this source.",
  computed: "Computed here from the source's data by an exact method.",
  estimate: "Estimate: calculated with simplifying assumptions.",
};

/**
 * A value that opens its provenance when tapped: source name and link, kind,
 * when it was fetched, and whether it may be out of date.
 */
export default function SourceButton({
  label,
  children,
  source,
  kind,
  fetchedAt,
  stale,
  note,
}: {
  label: string;
  children: ReactNode;
  source: SourceRef;
  kind: Kind;
  fetchedAt?: string | null;
  stale?: boolean;
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="source-btn"
        aria-haspopup="dialog"
        aria-label={`${label}: show source`}
        onClick={() => setOpen(true)}
      >
        {children}
        <span className="source-btn-icon" aria-hidden="true">
          i
        </span>
      </button>
      {/* Rendered into <body> only while open, so a source button can sit inside a paragraph
          (a <dialog> may not be a descendant of <p>) and the server HTML stays valid. */}
      {open && createPortal(
      <Sheet open={open} onClose={() => setOpen(false)} title={`Source: ${label}`}>
        <dl className="kv kv--text source-kv">
          <dt>From</dt>
          <dd>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.name}
            </a>
          </dd>
          <dt>Kind</dt>
          <dd>
            <Badge tone={kind === "estimate" ? "eclipsing" : "info"}>{kind}</Badge> {KIND_TEXT[kind]}
          </dd>
          {fetchedAt && (
            <>
              <dt>Fetched</dt>
              <dd>{formatUtc(fetchedAt)}</dd>
            </>
          )}
        </dl>
        {note && <p className="muted">{note}</p>}
        {stale && (
          <p className="callout" role="note">
            <strong>May be out of date.</strong> The source could not be reached just now, so this is the last
            copy we fetched.
          </p>
        )}
      </Sheet>,
      document.body)}
    </>
  );
}
