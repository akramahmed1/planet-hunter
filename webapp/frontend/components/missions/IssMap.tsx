"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, CircleMarker, Polyline } from "leaflet";
import SourceButton from "@/components/live/SourceButton";
import { useUnits } from "@/components/UnitsProvider";
import { apiV2Get, type Iss, type IssTrack } from "@/lib/api-v2";
import { pushTrail, splitAtDateLine } from "@/lib/iss";
import { KM_PER_MILE } from "@/lib/units";
import IssBoard from "./IssBoard";

const POLL_MS = 5000;
// OpenStreetMap's standard tiles: their usage policy asks for attribution and light use (docs/DATA_SOURCES.md).
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function IssMap() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const track = useRef<Polyline[]>([]);
  const trailPts = useRef<[number, number][]>([]);
  const trailLine = useRef<Polyline[]>([]);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const [iss, setIss] = useState<Iss | null>(null);
  const [down, setDown] = useState(false);
  const [trackNote, setTrackNote] = useState<IssTrack | null>(null);
  const { distance } = useUnits();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { worldCopyJump: true, zoomControl: true, attributionControl: true })
        .setView([0, 0], 1);
      L.tileLayer(TILE_URL, {
        maxZoom: 6,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      map.current = m;
      // Dragging the map means "let me look elsewhere": stop following until asked again.
      m.on("dragstart", () => { follow.current = false; setFollowing(false); });

      const t = await apiV2Get<IssTrack>("/api/v2/iss/track");
      if (!cancelled && t.ok) {
        setTrackNote(t.data);
        const pts = t.data.points.map((p) => [p.latitude, p.longitude] as [number, number]);
        track.current = splitAtDateLine(pts).map((part) =>
          L.polyline(part, { color: "#ffb547", weight: 2, dashArray: "6 6" }).addTo(m),
        );
      }

      async function tick() {
        if (document.visibilityState === "visible") {
          const r = await apiV2Get<Iss>("/api/v2/iss");
          if (cancelled) return;
          if (r.ok) {
            setIss(r.data);
            setDown(false);
            const ll: [number, number] = [r.data.latitude, r.data.longitude];
            if (!marker.current) {
              marker.current = L.circleMarker(ll, { radius: 8, color: "#04060d", weight: 2, fillColor: "#7cc4ff", fillOpacity: 1 })
                .addTo(m);
              m.setView(ll, 2);
            } else {
              marker.current.setLatLng(ll);
              if (follow.current) m.panTo(ll, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
            }
            // Where it has been while this page was open: a solid line behind it (the dashed line is where it goes next).
            trailPts.current = pushTrail(trailPts.current, ll);
            for (const l of trailLine.current) l.remove();
            trailLine.current = splitAtDateLine(trailPts.current).filter((part) => part.length > 1).map((part) =>
              L.polyline(part, { color: "#7cc4ff", weight: 2, opacity: 0.7 }).addTo(m));
          } else {
            setDown(true);
          }
        }
        timer = setTimeout(tick, POLL_MS);
      }
      tick();
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  const km = distance === "km";
  return (
    <section className="card" aria-labelledby="iss-h">
      <h2 id="iss-h" className="card-title">The International Space Station, live</h2>
      <div ref={el} className="iss-map" data-testid="iss-map" role="region"
        aria-label={iss ? `Map with the ISS above ${iss.latitude.toFixed(1)}° latitude, ${iss.longitude.toFixed(1)}° longitude` : "Map of the ISS position"} />
      <div className="btn-row">
        <button type="button" className="btn btn--sm" aria-pressed={following} data-testid="iss-follow" onClick={() => {
          const next = !follow.current;
          follow.current = next;
          setFollowing(next);
          if (next && iss) map.current?.panTo([iss.latitude, iss.longitude]);
        }}>
          {following ? "Following the station" : "Follow the station"}
        </button>
      </div>
      {iss ? (
        <>
          <p data-testid="iss-readout" className="sr-only">
            {iss.latitude.toFixed(2)}°, {iss.longitude.toFixed(2)}° · {Math.round(km ? iss.altitude_km : iss.altitude_km / KM_PER_MILE).toLocaleString("en-US")} {km ? "km" : "mi"} up
          </p>
          <IssBoard iss={iss} down={down} />
        </>
      ) : (
        <p className="muted">{down ? "The ISS position is unavailable right now." : "Finding the station..."}</p>
      )}
      {trackNote && (
        <p className="muted small">
          Dashed line: where it will pass over the next 90 minutes. Solid line: where it has been since you opened this page.{" "}
          <SourceButton label="ISS track" source={trackNote.source} kind={trackNote.kind} fetchedAt={trackNote.fetched_at}
            stale={trackNote.stale} note={trackNote.note}>
            <span>Source</span>
          </SourceButton>
        </p>
      )}
      <p className="muted small">Updates every 5 seconds while this page is open.</p>
    </section>
  );
}
