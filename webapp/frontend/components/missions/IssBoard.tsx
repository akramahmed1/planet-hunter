"use client";

import { useEffect } from "react";
import SourceButton from "@/components/live/SourceButton";
import { useUnits } from "@/components/UnitsProvider";
import type { Iss } from "@/lib/api-v2";
import { lapMinutes, speedValue, sunlightText } from "@/lib/iss";
import { seedIss, useIssFeed } from "@/lib/issFeed";
import { KM_PER_MILE } from "@/lib/units";

const latText = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const lonText = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;

/** The station's live numbers as a board: where it is, how high, how fast, whether the sun is on it, and one lap. */
export default function IssBoard({ iss: fromServer, down }: { iss: Iss; down: boolean }) {
  // The status strip and this board share one reading, so they never show two different positions for one minute.
  useEffect(() => seedIss(fromServer), [fromServer]);
  const feed = useIssFeed();
  const iss = feed.iss && Date.parse(feed.iss.fetched_at) >= Date.parse(fromServer.fetched_at) ? feed.iss : fromServer;
  const { distance } = useUnits();
  const km = distance === "km";
  const alt = Math.round(km ? iss.altitude_km : iss.altitude_km / KM_PER_MILE);
  const speed = speedValue(iss.velocity_kmh, km ? "km" : "mi");
  const lap = lapMinutes(iss.altitude_km, iss.velocity_kmh);
  const stale = iss.stale || down;
  const src = { source: iss.source, kind: iss.kind, fetchedAt: iss.fetched_at, stale };
  return (
    <ul className="tile-grid iss-board" data-testid="iss-board">
      <li className="tile">
        <p className="eyebrow">Over</p>
        <SourceButton label="ISS position" {...src}>
          <span className="tile-value mono" data-testid="iss-over">{latText(iss.latitude)}, {lonText(iss.longitude)}</span>
        </SourceButton>
      </li>
      <li className="tile">
        <p className="eyebrow">Height</p>
        <SourceButton label="ISS height" {...src}>
          <span className="tile-value mono" data-testid="iss-height">{alt.toLocaleString("en-US")} {km ? "km" : "mi"}</span>
        </SourceButton>
      </li>
      <li className="tile">
        <p className="eyebrow">Speed</p>
        <SourceButton label="ISS speed" {...src}>
          <span className="tile-value mono" data-testid="iss-speed">{speed.value.toLocaleString("en-US")} {speed.unit}</span>
        </SourceButton>
        {lap && (
          <p className="tile-sub" data-testid="iss-lap">
            One lap of the Earth takes about {Math.round(lap)} minutes (worked out here from its speed and height).
          </p>
        )}
      </li>
      <li className="tile">
        <p className="eyebrow">Sunlight</p>
        <SourceButton label="ISS sunlight" {...src}>
          <span className="tile-value" data-testid="iss-sunlight">{sunlightText(iss.visibility)}</span>
        </SourceButton>
      </li>
    </ul>
  );
}
