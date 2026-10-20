"use client";

import { useEffect, useState } from "react";
import { formatLocal, formatUtc } from "@/lib/time";

/** A timestamp in the viewer's time zone. The first paint is UTC (same on server and client), then it switches. */
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatUtc(iso));
  useEffect(() => {
    try {
      setText(formatLocal(iso));
    } catch {
      /* keep UTC */
    }
  }, [iso]);
  return <time dateTime={iso}>{text}</time>;
}
