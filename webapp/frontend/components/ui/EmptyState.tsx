import type { ReactNode } from "react";

export default function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state-title">{title}</p>
      {children}
    </div>
  );
}
