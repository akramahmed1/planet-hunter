"use client";

import { useEffect, useState } from "react";
import { apiV2Get, type Iss } from "@/lib/api-v2";
import { CLOCK_PLACEHOLDER, coordText, freshness, utcClock } from "@/lib/strip";

const POLL_MS = 60_000;

/**
 * A slim line under the top bar: UTC clock, where the ISS is, and how fresh that data is. It has a fixed height from
 * the first paint (so nothing jumps when it fills in), is never announced by screen readers (a ticking clock would
 * chatter), and falls back to plain words when the ISS service is down. The clock keeps working either way.
 */
export default function StatusStrip() {
  const [now, setNow] = useState<Date | null>(null);
  const [iss, setIss] = useState<Iss | null | undefined>(undefined); // undefined: not asked yet; null: unavailable
  const [failedSince, setFailedSince] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const clock = setInterval(() => {
      if (document.visibilityState === "visible") setNow(new Date());
    }, 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function ask() {
      if (document.visibilityState === "visible") {
        const r = await apiV2Get<Iss>("/api/v2/iss");
        if (cancelled) return;
        if (r.ok) {
          setIss(r.data);
          setFailedSince(false);
        } else {
          setIss((prev) => prev ?? null); // keep the last good answer, but say it may be old
          setFailedSince(true);
        }
      }
      timer = setTimeout(ask, POLL_MS);
    }
    ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

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
