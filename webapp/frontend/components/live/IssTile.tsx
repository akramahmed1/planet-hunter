"use client";

import { useEffect, useState } from "react";
import { useUnits } from "@/components/UnitsProvider";
import { apiV2Get, type Iss } from "@/lib/api-v2";
import { KM_PER_MILE } from "@/lib/units";
import { formatUtc } from "@/lib/time";
import SourceButton from "./SourceButton";

const POLL_MS = 5000;

function coord(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
}

/** The ISS right now, refreshed every 5 seconds (the API caches for 5 s). */
export default function IssTile({ initial }: { initial: Iss | null }) {
  const [iss, setIss] = useState<Iss | null>(initial);
  const [down, setDown] = useState(initial === null);
  const { distance } = useUnits();
  const miles = distance === "mi";

  useEffect(() => {
    // Poll only while the tab is visible, to spare battery and the provider.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    async function tick() {
      if (document.visibilityState === "visible") {
        const r = await apiV2Get<Iss>("/api/v2/iss");
        if (cancelled) return;
        if (r.ok) {
          setIss(r.data);
          setDown(false);
        } else {
          setDown(true);
        }
      }
      timer = setTimeout(tick, POLL_MS);
    }
    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <article className="tile" aria-labelledby="tile-iss">
      <p className="eyebrow" id="tile-iss">
        ISS right now
      </p>
      {iss ? (
        <>
          <SourceButton label="ISS position" source={iss.source} kind={iss.kind} fetchedAt={iss.fetched_at}
            stale={iss.stale || down}>
            <span className="tile-value mono">
              {coord(iss.latitude, "N", "S")}, {coord(iss.longitude, "E", "W")}
            </span>
          </SourceButton>
          <p className="tile-sub">
            {miles
              ? `${Math.round(iss.altitude_km / KM_PER_MILE).toLocaleString("en-US")} mi up, ${Math.round(iss.velocity_kmh / KM_PER_MILE).toLocaleString("en-US")} mph`
              : `${Math.round(iss.altitude_km).toLocaleString("en-US")} km up, ${Math.round(iss.velocity_kmh).toLocaleString("en-US")} km/h`}
            {iss.visibility === "daylight" ? " · in sunlight" : iss.visibility === "eclipsed" ? " · in Earth's shadow" : ""}
          </p>
          <p className="tile-meta">
            Updated <time dateTime={iss.fetched_at}>{formatUtc(iss.fetched_at)}</time>
            {(iss.stale || down) && <span className="stale-tag">May be out of date</span>}
          </p>
        </>
      ) : (
        <>
          <p className="tile-sub">The ISS position service is unavailable right now. We will try again shortly.</p>
          <p className="tile-meta">
            <span className="stale-tag">Unavailable</span>
          </p>
        </>
      )}
    </article>
  );
}
