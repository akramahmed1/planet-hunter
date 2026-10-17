import type { ReactNode } from "react";

/** One headline number with its label, and optionally where it comes from. */
export default function Stat({
  value,
  label,
  hint,
}: {
  value: ReactNode;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
