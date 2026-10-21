"use client";

import { useId, useState } from "react";
import { count } from "@/lib/plural";

const WHY =
  "Planet Hunter ran the same pipeline twice. The validation run on TOI 700 used 4 TESS sectors; the batch scan of " +
  "all eight stars used 2 sectors each. More data gives a slightly different best-fit period and depth, so a " +
  "star can show two close but different numbers. Neither is a discovery.";

/** Says which run a period or depth came from, with an "i" that explains why runs differ. */
export default function RunLabel({ kind, sectors, date }: { kind: "validation" | "batch" | "scan"; sectors: number; date?: string | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const name = kind === "validation" ? "Validation run" : kind === "batch" ? "Batch scan" : "Your scan";
  const text = [name, count(sectors, "sector"), date].filter(Boolean).join(" · ");
  return (
    <span className="run-label" data-testid="run-label">
      <span>{text}</span>
      <button type="button" className="run-label-i" aria-expanded={open} aria-controls={id}
        aria-label="Why numbers differ between runs" onClick={() => setOpen((o) => !o)}>
        i
      </button>
      {open && <span id={id} role="note" className="run-label-note">{WHY}</span>}
    </span>
  );
}
