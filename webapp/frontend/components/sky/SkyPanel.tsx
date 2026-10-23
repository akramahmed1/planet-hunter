"use client";

import { useEffect, useRef, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import type { SourceRef } from "@/lib/api-v2";
import Toggle from "@/components/ui/Toggle";
import { DEFAULT_SKY_FOV, formatDec, formatRa, RING_RADIUS_DEG, SKY_FOVS, type SkyFov } from "@/lib/sky";

// Aladin Lite from the CDS server (GPL-3.0; see docs/DATA_SOURCES.md flag 2). Loaded only when asked for.
// Pinned to a release (3.8.2, the latest non-beta on npm as of 2026-10-18); the staging check fetches it.
export const ALADIN_SRC = "https://aladin.cds.unistra.fr/AladinLite/api/v3/3.8.2/aladin.js";

type AladinView = {
  setFoV?: (deg: number) => void;
  addCatalog?: (c: unknown) => void;
  addOverlay?: (o: unknown) => void;
};
type AladinGlobal = {
  init: Promise<void>;
  aladin: (el: HTMLElement, opts: Record<string, unknown>) => AladinView | undefined;
  marker?: (ra: number, dec: number, o: Record<string, unknown>) => unknown;
  catalog?: (o?: Record<string, unknown>) => { addSources?: (s: unknown[]) => void };
  graphicOverlay?: (o: Record<string, unknown>) => { add?: (s: unknown) => void };
  circle?: (ra: number, dec: number, radiusDeg: number, o?: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    A?: AladinGlobal;
  }
}

function loadAladin(): Promise<AladinGlobal> {
  if (window.A) return window.A.init.then(() => window.A!);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = ALADIN_SRC;
    s.async = true;
    s.onload = () => (window.A ? window.A.init.then(() => resolve(window.A!), reject) : reject(new Error("no A")));
    s.onerror = () => reject(new Error("Aladin Lite could not be loaded"));
    document.head.appendChild(s);
  });
}

/**
 * Add the target marker and the one-arcminute ring. The picture is the point; if this viewer version lacks an overlay
 * call, the sky image still shows and the crosshair still marks the star.
 */
function mark(A: AladinGlobal, v: AladinView | undefined, ra: number, dec: number, name: string) {
  try {
    if (v && A.marker && A.catalog && v.addCatalog) {
      const layer = A.catalog({ name: "Target" });
      v.addCatalog(layer);
      layer.addSources?.([A.marker(ra, dec, { popupTitle: name, popupDesc: "The star this candidate signal is about." })]);
    }
  } catch { /* the viewer still works without the marker */ }
  try {
    if (v && A.graphicOverlay && A.circle && v.addOverlay) {
      const ring = A.graphicOverlay({ color: "#eef1fa", lineWidth: 1.5 });
      v.addOverlay(ring);
      ring.add?.(A.circle(ra, dec, RING_RADIUS_DEG, { color: "#eef1fa" }));
    }
  } catch { /* likewise without the ring */ }
}

/** "Where in the sky": the star's coordinates, and an interactive sky image on request. */
export default function SkyPanel({ name, ra, dec, source }: { name: string; ra: number; dec: number; source: SourceRef }) {
  const [state, setState] = useState<"idle" | "loading" | "shown" | "failed">("idle");
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<AladinView | undefined>(undefined);
  const [fov, setFov] = useState<SkyFov>(DEFAULT_SKY_FOV);

  useEffect(() => {
    if (state !== "loading") return;
    let cancelled = false;
    loadAladin()
      .then((A) => {
        if (cancelled || !box.current) return;
        view.current = A.aladin(box.current, { survey: "P/DSS2/color", fov: DEFAULT_SKY_FOV.deg, target: `${ra} ${dec}`,
          showReticle: true, showCooGridControl: false, showFullscreenControl: false });
        mark(A, view.current, ra, dec, name);
        setState("shown");
      })
      .catch(() => !cancelled && setState("failed"));
    return () => {
      cancelled = true;
    };
  }, [state, ra, dec]);

  return (
    <section aria-labelledby="sky-h" className="card sky-panel" data-testid="sky-panel">
      <h2 id="sky-h" className="card-title">Where in the sky</h2>
      <p>
        <SourceButton label={`${name} sky position`} source={source} kind="measured"
          note="Right ascension and declination, J2000, from the TESS Input Catalog.">
          <span className="mono" data-testid="sky-coords">RA {formatRa(ra)} · Dec {formatDec(dec)}</span>
        </SourceButton>
      </p>
      <p className="muted">
        {dec < 0 ? "A southern sky star" : "A northern sky star"}. It is far too faint to see without a telescope.
      </p>
      {state === "idle" && (
        <button type="button" className="btn" onClick={() => setState("loading")} data-testid="sky-show">
          Show the sky around this star
        </button>
      )}
      {state === "failed" && (
        <p className="error-box" role="alert">The sky viewer could not be loaded right now.</p>
      )}
      {state !== "idle" && state !== "failed" && (
        <>
          <div ref={box} className="sky-view" data-testid="sky-view" data-heavy-gl="" aria-label={`Sky image centered on ${name}`}
            role="img" />
          {state === "shown" && (
            <Toggle legend="Field of view" options={SKY_FOVS.map((f) => ({ value: f.id, label: f.label, title: f.title }))}
              value={fov.id} onChange={(id) => {
                const next = SKY_FOVS.find((f) => f.id === id) ?? DEFAULT_SKY_FOV;
                setFov(next);
                try { view.current?.setFoV?.(next.deg); } catch { /* keep the current field */ }
              }} />
          )}
          <p className="muted small" data-testid="sky-note">
            Sky image: Digitized Sky Survey, STScI/NASA, colored and made into HiPS by CDS. Viewer: Aladin Lite, CDS
            Strasbourg. The crosshair and the marker show the star. The ring is 1 arcminute across: a TESS pixel is
            about 21 arcseconds wide, so every star inside it is blended into the same few pixels of this star&apos;s light
            curve.
          </p>
        </>
      )}
    </section>
  );
}
