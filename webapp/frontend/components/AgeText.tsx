"use client";

import { useEffect, useState } from "react";
import { ageLabel, ageLabelLocal } from "@/lib/time";

/** "12 days ago" for a calendar date, counted in the viewer's own time zone. The first paint is the UTC count (the same
 * on server and browser); it only changes near midnight, when the two disagree. */
export function useAgeLabel(date: string | null | undefined): string {
  const [text, setText] = useState(() => (date ? ageLabel(date) : ""));
  useEffect(() => {
    if (!date) return;
    try {
      setText(ageLabelLocal(date));
    } catch {
      setText(ageLabel(date));
    }
  }, [date]);
  return text;
}

export default function AgeText({ date }: { date: string }) {
  const text = useAgeLabel(date);
  return <span suppressHydrationWarning>{text}</span>;
}
