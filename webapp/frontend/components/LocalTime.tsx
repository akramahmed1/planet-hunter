"use client";

import { useEffect, useState } from "react";
import { formatLocal, formatUtc } from "@/lib/time";

/** A timestamp in the viewer's time zone. The first paint is UTC (same on server and client), then it switches. */
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatUtc(iso));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setText(formatLocal(iso));
    } catch {
      /* keep UTC */
    }
    setReady(true);
  }, [iso]);
  // Hidden until the local time is ready, so the UTC text never flashes before it (shown at once without scripts).
  return <time dateTime={iso} className={ready ? undefined : "local-pending"}>{text}</time>;
}
