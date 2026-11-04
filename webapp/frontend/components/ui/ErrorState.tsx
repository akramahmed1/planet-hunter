import type { ReactNode } from "react";

/**
 * Shown when data can't be loaded. The site never falls back to hardcoded
 * copies of the data, so this explains the gap instead.
 */
export default function ErrorState({
  title,
  children,
  detail,
}: {
  title: string;
  children?: ReactNode;
  detail?: string;
}) {
  return (
    <div className="state state--error error-box" role="alert">
      <p className="state-title">{title}</p>
      {children}
      {detail && <p className="muted">Details: {detail}</p>}
    </div>
  );
}
