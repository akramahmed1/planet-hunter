"use client";

import { useEffect, useState } from "react";
import { useIssFeed } from "@/lib/issFeed";
import { CLOCK_PLACEHOLDER, coordText, freshness, utcClock } from "@/lib/strip";

/**
 * A slim line under the top bar: UTC clock, where the ISS is, and how fresh that data is. It has a fixed height from
 * the first paint (so nothing jumps when it fills in), is never announced by screen readers (a ticking clock would
 * chatter), and falls back to plain words when the ISS service is down. The clock keeps working either way.
 */
export default function StatusStrip() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const clock = setInterval(() => {
      if (document.visibilityState === "visible") setNow(new Date());
    }, 1000);
    return () => clearInterval(clock);
  }, []);

  const { iss, failedSince } = useIssFeed();

  const old = Boolean(iss && (iss.stale || failedSince));
  return (
    <section className="statusstrip" aria-label="Live status" data-testid="status-strip">
      <div className="statusstrip-inner">
        <span className="strip-item">
          <span className="strip-label">UTC</span>{" "}
          <time className="mono strip-clock" data-testid="strip-clock" dateTime={now ? now.toISOString() : undefined}>
            {now ? utcClock(now) : CLOCK_PLACEHOLDER}
          </time>
        </span>
        {iss ? (
          <>
            <span className="strip-item strip-coords" data-testid="strip-iss">
              <span className="strip-label">ISS</span>{" "}
              <span className="mono">
                {coordText(iss.latitude, "N", "S")} {coordText(iss.longitude, "E", "W")}
              </span>
            </span>
            <span className="strip-item strip-fresh" data-testid="strip-fresh">
              <span className="strip-label strip-label--short">ISS </span>data {freshness(iss.fetched_at, now ?? new Date(iss.fetched_at))}
              {old && <span className="stale-tag">May be out of date</span>}
            </span>
          </>
        ) : (
          <span className="strip-item strip-fresh" data-testid="strip-fresh">
            {iss === null ? "ISS position unavailable right now" : "Checking the ISS"}
          </span>
        )}
      </div>
    </section>
  );
}
