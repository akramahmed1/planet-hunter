"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Ask the live sources again. The page is drawn on the server, so this just draws it again. */
export default function RetryButton({ label = "Check again" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn--sm btn--ghost" data-testid="retry" disabled={pending}
      onClick={() => start(() => router.refresh())}>
      {pending ? "Checking..." : label}
    </button>
  );
}
