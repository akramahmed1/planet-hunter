"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import { useReducedMotion, useWebGL } from "@/components/three/hooks";
import type { SourcedFact } from "@/lib/api-v2";

const TessModel = dynamic(() => import("./TessModel"), { ssr: false });

function Cite({ label, fact, kind = "measured" }: { label: string; fact: SourcedFact; kind?: "measured" | "computed" }) {
  return (
    <SourceButton label={label} source={fact.source} kind={kind} fetchedAt={fact.fetched_at}
      note={`Source wording: "${fact.quote}"`}>
      <span className="muted">Source</span>
    </SourceButton>
  );
}

/** Earth, the Moon's orbit and TESS's orbit, to scale (distances from Earth's center, km). */
function OrbitDiagram({ moonKm }: { moonKm: number }) {
  const perigee = 108_400;
  const apogee = 376_300;
  const a = (perigee + apogee) / 2;
  const c = a - perigee; // center offset from Earth (a focus)
  const b = Math.sqrt(a * a - c * c);
  const E = moonKm * 1.08;
  return (
    <svg viewBox={`${-E} ${-E} ${2 * E} ${2 * E}`} className="tess-diagram" role="img"
      aria-label="To-scale drawing: Earth at the center, the Moon's orbit as a circle, and TESS's long oval orbit reaching almost as far as the Moon">
      <circle r={moonKm} fill="none" stroke="var(--line-strong)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
      <ellipse cx={-c} cy={0} rx={a} ry={b} fill="none" stroke="var(--flare)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle r={6371 * 3} fill="var(--ion)" />
      <circle cx={moonKm} r={1737 * 4} fill="var(--dust)" />
      <circle cx={-apogee} r={E * 0.02} fill="var(--flare)" />
      <text x={moonKm} y={-E * 0.06} textAnchor="middle" fontSize={E * 0.06} fill="var(--ink-dim)">Moon</text>
      <text x={0} y={E * 0.12} textAnchor="middle" fontSize={E * 0.06} fill="var(--ink-dim)">Earth</text>
      <text x={-apogee} y={-E * 0.06} textAnchor="middle" fontSize={E * 0.06} fill="var(--flare)">TESS</text>
    </svg>
  );
}

function CameraDiagram() {
  return (
    <svg viewBox="-2 -2 28 100" className="tess-diagram tess-diagram--tall" role="img"
      aria-label="Four squares, each 24 degrees wide, stacked into one strip 24 by 96 degrees: one sector">
      {[0, 1, 2, 3].map((k) => (
        <g key={k}>
          <rect x={0} y={k * 24} width={24} height={24} fill="var(--ion-soft)" stroke="var(--ion)" strokeWidth={0.5} />
          <text x={12} y={k * 24 + 14} textAnchor="middle" fontSize={5} fill="var(--ink)">Camera {4 - k}</text>
        </g>
      ))}
    </svg>
  );
}

/** Planet crossing its star and the light curve it draws. depth is the fraction of light blocked. */
function TransitDemo({ depth }: { depth: number }) {
  const reduced = useReducedMotion();
  const [p, setP] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  // Once the reader takes hold of the slider, scrolling no longer moves the planet.
  const manual = useRef(false);
  const sliderId = useId();
  const k = Math.sqrt(depth); // planet radius / star radius
  // Show the planet 4x larger than true so it is visible; the curve uses the true ratio.
  const shown = Math.min(k * 4, 0.3);

  // Scroll-driven: progress follows the section through the screen, unless motion is reduced.
  useEffect(() => {
    if (reduced) return;
    const onScroll = () => {
      const el = box.current;
      if (!el || manual.current) return;
      const r = el.getBoundingClientRect();
      const t = 1 - (r.top + r.height / 2) / window.innerHeight;
      setP(Math.min(1, Math.max(0, t * 1.4 - 0.2)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduced]);

  const x = -1.6 + 3.2 * p; // planet center, in star radii
  const flux = useCallback((xc: number) => {
    // Fraction of the star covered: exact circle-circle overlap (uniform disc, no limb darkening).
    const d = Math.abs(xc);
    if (d >= 1 + k) return 1;
    if (d <= 1 - k) return 1 - k * k;
    const r = k;
    const a1 = r * r * Math.acos((d * d + r * r - 1) / (2 * d * r));
    const a2 = Math.acos((d * d + 1 - r * r) / (2 * d));
    const a3 = 0.5 * Math.sqrt((-d + r + 1) * (d + r - 1) * (d - r + 1) * (d + r + 1));
    return 1 - (a1 + a2 - a3) / Math.PI;
  }, [k]);
  const pts = Array.from({ length: 81 }, (_, i) => -1.6 + (3.2 * i) / 80).filter((v) => v <= x);
  const y = (f: number) => 20 + ((1 - f) / depth) * 50;
  return (
    <div ref={box} className="transit-demo">
      <svg viewBox="-1.8 -1.2 3.6 2.4" className="tess-diagram" role="img"
        aria-label="A star with a planet crossing in front of it">
        <circle r={1} fill="#ffd9a8" />
        <circle cx={x} cy={0.15} r={shown} fill="#0b1122" />
      </svg>
      <svg viewBox="0 0 320 90" className="tess-curve" role="img" data-testid="light-curve"
        aria-label={`Light curve: brightness ${(flux(x) * 100).toFixed(2)} percent of normal`}>
        <line x1={0} y1={20} x2={320} y2={20} stroke="var(--line)" />
        <polyline fill="none" stroke="var(--aurora)" strokeWidth={2}
          points={pts.map((v) => `${((v + 1.6) / 3.2) * 320},${y(flux(v))}`).join(" ")} />
        <text x={4} y={14} fontSize={9} fill="var(--ink-dim)">Normal brightness</text>
        <text x={4} y={86} fontSize={9} fill="var(--ink-dim)">{(depth * 100).toFixed(2)}% dimmer</text>
      </svg>
      <label htmlFor={sliderId} className="select-label">Move the planet</label>
      <input id={sliderId} type="range" min={0} max={1000} value={Math.round(p * 1000)}
        onFocus={() => { manual.current = true; }} onPointerDown={() => { manual.current = true; }}
        onChange={(e) => {
          manual.current = true;
          setP(Number(e.target.value) / 1000);
        }} data-testid="transit-slider" />
      <p className="muted small" data-testid="transit-readout">
        Brightness now: {(flux(x) * 100).toFixed(3)}% of normal. The planet is drawn four times larger than it is, so
        you can see it; the curve uses its true size.
      </p>
    </div>
  );
}

export default function TessExplainer({ facts, moonKm, depthPpm, target }: {
  facts: Record<string, SourcedFact>;
  moonKm: number;
  depthPpm: number;
  target: string;
}) {
  const webgl = useWebGL();
  const reduced = useReducedMotion();
  const [modelSource, setModelSource] = useState<"nasa" | "procedural" | null>(null);
  const onSource = useCallback((s: "nasa" | "procedural") => setModelSource(s), []);
  return (
    <div className="tess">
      <section className="tess-step" aria-labelledby="t-hero">
        <h2 id="t-hero">Meet TESS</h2>
        {webgl ? (
          <div className="tess-model-wrap">
            {/* The panel's own look from the first paint; the model draws over it. */}
            {modelSource === null && <div className="tess-model tess-model--placeholder" aria-hidden="true" />}
            <TessModel reducedMotion={reduced} onSource={onSource} />
            {modelSource === null && <p className="scene-loading" role="status">Loading the 3D view</p>}
          </div>
        ) : (
          <p className="muted">Your browser cannot show the 3D model here.</p>
        )}
        <p>
          The Transiting Exoplanet Survey Satellite launched on 18 April 2018 (22:51 UTC). Its job: watch about
          200,000 nearby stars for the tiny dips that planets make. <Cite label="TESS launch" fact={facts.launch} />{" "}
          <Cite label="TESS target stars" fact={facts.stars} />
        </p>
        {/* Always rendered, so the text below never shifts when the model finishes loading. */}
        <p className="muted small" data-testid="model-credit">
          {modelSource === "nasa"
            ? "3D model: NASA 3D Resources (TESS model A), free to use."
            : modelSource === "procedural"
              ? "Simple stand-in model: the NASA model could not be loaded."
              : "\u00a0" /* the loading note sits on the model; this keeps the line's height */}
        </p>
      </section>

      <section className="tess-step" aria-labelledby="t-orbit">
        <h2 id="t-orbit">1. A long, looping orbit</h2>
        <OrbitDiagram moonKm={moonKm} />
        <p>
          TESS swings between about 108,400 km and 376,300 km from Earth, in step with the Moon: it goes around twice
          for every one trip of the Moon (a 2:1 lunar resonance). <Cite label="TESS orbit" fact={facts.orbit} />
        </p>
        <p className="muted small">Drawn to scale. Earth and the Moon are drawn larger than life so you can see them.</p>
      </section>

      <section className="tess-step" aria-labelledby="t-cams">
        <h2 id="t-cams">2. Four cameras, one strip of sky</h2>
        <CameraDiagram />
        <p>
          TESS has four cameras pointing in a line. Together they see a strip of sky 24° wide and 96° long, called a
          sector, so each camera covers about 24° by 24°. <Cite label="TESS cameras" fact={facts.cameras} />{" "}
          <Cite label="TESS sector size" fact={facts.sector} />
        </p>
      </section>

      <section className="tess-step" aria-labelledby="t-sector">
        <h2 id="t-sector">3. Staring for 27 days</h2>
        <p>
          TESS stares at each sector for two orbits, about 27 days, then turns to the next one. Near the pole of the
          sky the sectors overlap, so a patch 24° across is watched for almost a whole year. Long stares are what let
          it catch planets that pass in front of their star again and again.{" "}
          <Cite label="TESS sector length" fact={facts.sector} /> <Cite label="TESS pole coverage" fact={facts.pole} />
        </p>
      </section>

      <section className="tess-step" aria-labelledby="t-transit">
        <h2 id="t-transit">4. From a shadow to a light curve</h2>
        <p>
          When a planet passes in front of its star, it blocks a little of the light. For the stars in our search, TESS
          measured brightness every 2 minutes; plotted over time, that is a light curve, and the planet shows up as a dip.
          Scroll, or move the slider, to make a transit.
        </p>
        <TransitDemo depth={depthPpm / 1e6} />
        <p className="muted small">
          The dip here is the one our pipeline measured for {target}: {depthPpm.toLocaleString("en-US")} parts per
          million. The shape assumes an evenly bright star; real stars are a little darker at the edges.
        </p>
      </section>
    </div>
  );
}
