"use client";

import { Component, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useReducedMotion, useWebGL } from "@/components/three/hooks";
import { globeCaption, graticule, nightShape, project, subsolarPoint } from "@/lib/globe";
import { useIssFeed } from "@/lib/issFeed";
import type { EarthSceneProps } from "./EarthScene3D";

const VIEW_LAT = 22;
const R = 100; // svg units per globe radius

class Guard extends Component<{ onError: () => void; children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.bad ? null : this.props.children; }
}

const path = (pts: { x: number; y: number }[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${(p.x * R).toFixed(1)} ${(-p.y * R).toFixed(1)}`).join("") + (close ? "Z" : "");

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (h: number) => void;
};

/**
 * A stylised globe: a grid, the real day and night sides for the current time, and the real ISS position. The still
 * SVG version is the first paint and the permanent fallback. Three.js is fetched only once the page is idle, and only
 * when this browser can draw WebGL, has not asked for less motion and is not on a data saver. Anything going wrong
 * leaves the SVG in place.
 */
export default function EarthHero() {
  const { iss } = useIssFeed();
  const webgl = useWebGL();
  const reduced = useReducedMotion();
  const [now, setNow] = useState<Date | null>(null);
  const [Scene, setScene] = useState<ComponentType<EarthSceneProps> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const want3d = webgl === true && !reduced && !failed;
  useEffect(() => {
    if (!want3d) return;
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saver) return;
    let cancelled = false;
    const load = () => {
      import("./EarthScene3D")
        .then((m) => { if (!cancelled) setScene(() => m.default); })
        .catch(() => { if (!cancelled) setFailed(true); });
    };
    const w = window as unknown as IdleWindow;
    const handle = w.requestIdleCallback ? w.requestIdleCallback(load, { timeout: 2500 }) : window.setTimeout(load, 800);
    return () => {
      cancelled = true;
      if (w.requestIdleCallback) w.cancelIdleCallback?.(handle);
      else clearTimeout(handle);
    };
  }, [want3d]);

  const issLive = iss ?? null;
  const sun = useMemo(() => (now ? subsolarPoint(now) : null), [now]);
  const view = useMemo(() => ({ lat: VIEW_LAT, lon: issLive ? issLive.longitude : 0 }), [issLive]);
  const lines = useMemo(() => graticule(view), [view]);
  const night = useMemo(() => (sun ? nightShape(sun, view) : null), [sun, view]);
  const marker = issLive ? project(issLive.latitude, issLive.longitude, view) : null;
  const on3d = Scene !== null && ready && !failed;
  const running = !paused && inView && tabVisible;

  return (
    <div className="earth-hero" data-testid="earth-hero" data-mode={on3d ? "3d" : "svg"} ref={box}>
      <div className="earth-stage">
        <svg viewBox="-112 -112 224 224" role="img" aria-label={globeCaption(iss)} className="earth-svg" data-testid="earth-svg"
          style={{ visibility: on3d ? "hidden" : "visible" }}>
          <defs>
            <radialGradient id="earth-fill" cx="38%" cy="32%" r="80%">
              <stop offset="0%" stopColor="#2c5ca3" /><stop offset="100%" stopColor="#10274d" />
            </radialGradient>
            <radialGradient id="earth-halo" cx="50%" cy="50%" r="50%">
              <stop offset="88%" stopColor="#7cc4ff" stopOpacity="0.28" /><stop offset="100%" stopColor="#7cc4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle r="111" fill="url(#earth-halo)" />
          <circle r={R} fill="url(#earth-fill)" />
          {night && <path d={path(night, true)} fill="#050a18" fillOpacity="0.62" />}
          <g fill="none" stroke="#7cc4ff" strokeOpacity="0.3" strokeWidth="0.6">
            {lines.map((l, i) => <path key={i} d={path(l)} />)}
          </g>
          <circle r={R} fill="none" stroke="#b0dcff" strokeOpacity="0.35" strokeWidth="0.8" />
          {marker?.visible && (
            <g transform={`translate(${(marker.x * R).toFixed(1)} ${(-marker.y * R).toFixed(1)})`}>
              <circle r="6" fill="#ffb547" fillOpacity="0.25" /><circle r="2.6" fill="#ffb547" />
            </g>
          )}
        </svg>
        {Scene && !failed && (
          <div className="earth-3d" aria-hidden="true" data-heavy-gl="" data-ready={ready}>
            <Guard onError={() => setFailed(true)}>
              <Scene sun={sun ?? { lat: 0, lon: 0 }} iss={issLive} running={running} onReady={() => setReady(true)} onLost={() => setFailed(true)} />
            </Guard>
          </div>
        )}
      </div>
      {/* Always in the layout so the box does not grow when 3D arrives; hidden (and out of the tab order) until then. */}
      <button type="button" className="btn btn--sm earth-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}
        data-testid="earth-pause" style={{ visibility: on3d ? "visible" : "hidden" }}>
        {paused ? "Play motion" : "Pause motion"}
      </button>
    </div>
  );
}
