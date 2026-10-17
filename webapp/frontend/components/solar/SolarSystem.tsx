"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Toggle from "@/components/ui/Toggle";
import { UnitsToggles } from "@/components/shell/UnitsControls";
import {
  apiV2Get,
  type Body,
  type OrbitsResponse,
  type Position,
  type PositionsResponse,
} from "@/lib/api-v2";
import { BODY_NAMES, SCENE_BODIES, type Scale, type SceneBodyId } from "@/lib/solar";
import { buildTour, TOUR_ORDER } from "@/lib/tour";
import { BodySheet, DeepSpaceSheet } from "./BodySheet";
import { buildModel, type Mode, type Zoom } from "./model";
import OrbitMap2D from "./OrbitMap2D";
import { DateControl, MeasurePanel, TourPanel } from "./Panels";

type View = "3d" | "map";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

const SCALE_OPTIONS = [
  { value: "true" as const, label: "True scale", title: "True scale distances" },
  { value: "easy" as const, label: "Easy view", title: "Easy view, distances squeezed" },
];
const ZOOM_OPTIONS = [
  { value: "all" as const, label: "Everything", title: "Show everything out to Pluto" },
  { value: "inner" as const, label: "Inner planets", title: "Show the inner planets" },
];
const VIEW_OPTIONS = [
  { value: "3d" as const, label: "3D", title: "3D view" },
  { value: "map" as const, label: "Map", title: "Flat map view" },
];
const MODE_OPTIONS = [
  { value: "explore" as const, label: "Explore", title: "Explore: tap a body for its card" },
  { value: "measure" as const, label: "Measure", title: "Measure: tap two bodies" },
  { value: "tour" as const, label: "Tour", title: "Tour from the Sun to Neptune" },
];

export default function SolarSystem({
  bodies,
  initial,
  orbits,
}: {
  bodies: Body[];
  initial: PositionsResponse;
  orbits: OrbitsResponse;
}) {
  const today = initial.date;
  const [date, setDate] = useState(today);
  const [data, setData] = useState<PositionsResponse>(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>("true");
  const [zoom, setZoom] = useState<Zoom>("all");
  const [mode, setMode] = useState<Mode>("explore");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("3d");
  const [selected, setSelected] = useState<SceneBodyId | null>(null);
  const [deepSpace, setDeepSpace] = useState(false);
  const [picks, setPicks] = useState<SceneBodyId[]>([]);
  const [tourIndex, setTourIndex] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => setWebgl(hasWebGL()), []);

  // Fetch positions for a new date, after the slider settles.
  useEffect(() => {
    if (date === data.date) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await apiV2Get<PositionsResponse>(`/api/v2/positions?date=${date}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (r.ok) {
        setData(r.data);
        setLoadError(null);
      } else {
        setLoadError(r.error);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [date, data.date]);

  const bodyMap = useMemo(() => Object.fromEntries(bodies.map((b) => [b.id, b])), [bodies]);
  const posMap = useMemo(
    () => Object.fromEntries(data.bodies.map((p) => [p.id, p])) as Record<string, Position>,
    [data],
  );
  const tour = useMemo(() => buildTour(bodyMap), [bodyMap]);
  const model = useMemo(() => buildModel(data, orbits, scale, zoom), [data, orbits, scale, zoom]);

  const tourId = TOUR_ORDER[tourIndex];
  const highlight = mode === "measure" ? picks : mode === "tour" ? [tourId] : selected ? [selected] : [];
  const line = mode === "measure" && picks.length === 2 ? ([picks[0], picks[1]] as [SceneBodyId, SceneBodyId]) : null;
  const focus = mode === "tour" ? tourId : null;

  const onPick = useCallback(
    (id: SceneBodyId) => {
      if (mode === "measure") {
        setPicks((p) => (p.length >= 2 ? [id] : p[0] === id ? p : [...p, id]));
      } else {
        setSelected(id);
      }
    },
    [mode],
  );
  const onEmpty = useCallback(() => {
    if (mode !== "measure") setDeepSpace(true);
  }, [mode]);

  const show3d = view === "3d" && webgl === true;
  const viewProps = { model, highlight, line, onPick, onEmpty };

  return (
    <div className="solar">
      <div className="solar-viewport">
        {/* The map is the first paint; the 3D view covers it once three.js has drawn a frame. */}
        {!(show3d && sceneReady) && <OrbitMap2D {...viewProps} />}
        {show3d && (
          <Scene3D {...viewProps} focus={focus} reducedMotion={reducedMotion} ready={sceneReady}
            onReady={() => setSceneReady(true)} />
        )}
      </div>
      {webgl === false && (
        <p className="muted" data-testid="webgl-note">
          Your browser cannot show 3D here, so this is a flat map seen from above. Everything else works the same.
        </p>
      )}

      <p className="muted solar-scale-note" data-testid="scale-note">
        {scale === "true"
          ? "Distances are to scale. Planets are drawn as large dots: at true size every one of them would be far smaller than a pixel here."
          : "Easy view: distances are squeezed so everything fits. The order is right, the spacing is not."}
      </p>

      <div className="body-picker" role="group" aria-label="Choose a body">
        {SCENE_BODIES.map((id) => (
          <button
            key={id}
            type="button"
            className="btn btn--sm"
            aria-pressed={highlight.includes(id)}
            onClick={() => onPick(id)}
            data-testid={`pick-${id}`}
          >
            {BODY_NAMES[id]}
          </button>
        ))}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDeepSpace(true)}
          data-testid="pick-deep-space">
          Deep space
        </button>
      </div>

      <Toggle legend="Mode" options={MODE_OPTIONS} value={mode} onChange={(m) => {
        setMode(m);
        setPicks([]);
      }} />

      {mode === "explore" && (
        <p className="muted">Tap a planet for its card, or tap empty space to see how cold space is.</p>
      )}
      {mode === "measure" && (
        <MeasurePanel picks={picks} positions={posMap} date={data.date} onClear={() => setPicks([])} />
      )}
      {mode === "tour" && <TourPanel stops={tour} index={tourIndex} onIndex={setTourIndex} />}

      <div className="solar-controls">
        <Toggle legend="Scale" options={SCALE_OPTIONS} value={scale} onChange={setScale} />
        <Toggle legend="Show" options={ZOOM_OPTIONS} value={zoom} onChange={setZoom} />
        {webgl && <Toggle legend="View" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      </div>

      <DateControl
        date={date}
        today={today}
        from={initial.valid_from}
        to={initial.valid_to}
        loading={date !== data.date && !loadError}
        onDate={setDate}
      />
      {loadError && (
        <p className="error-box" role="alert">
          Positions for {date} could not be loaded ({loadError}). Showing {data.date}.
        </p>
      )}
      {data.notes.map((n) => (
        <p key={n} className="muted">
          {n}
        </p>
      ))}

      <details className="solar-units">
        <summary>Units</summary>
        <UnitsToggles />
      </details>

      <BodySheet
        id={selected}
        body={selected ? (bodyMap[selected] ?? null) : null}
        bodies={bodyMap}
        positions={posMap}
        date={data.date}
        onClose={() => setSelected(null)}
      />
      <DeepSpaceSheet open={deepSpace} onClose={() => setDeepSpace(false)} />
    </div>
  );
}

const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });
