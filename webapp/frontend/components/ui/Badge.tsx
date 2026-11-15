import type { ReactNode } from "react";

export type BadgeTone =
  | "clean"
  | "eclipsing"
  | "ambiguous"
  | "marginal"
  | "noise"
  | "unreviewed"
  | "info"
  | "outline";

export default function Badge({ tone = "info", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
