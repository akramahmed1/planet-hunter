"use client";

import { useEffect, useRef, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import type { SourceRef } from "@/lib/api-v2";
import { formatDec, formatRa } from "@/lib/sky";

// Aladin Lite v3 from the CDS server (GPL-3.0; see docs/DATA_SOURCES.md flag 2). Loaded only when asked for.
export const ALADIN_SRC = "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js";

type AladinGlobal = {
  init: Promise<void>;
  aladin: (el: HTMLElement, opts: Record<string, unknown>) => unknown;
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

/** "Where in the sky": the star's coordinates, and an interactive sky image on request. */
export default function SkyPanel({ name, ra, dec, source }: { name: string; ra: number; dec: number; source: SourceRef }) {
  const [state, setState] = useState<"idle" | "loading" | "shown" | "failed">("idle");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state !== "loading") return;
    let cancelled = false;
    loadAladin()
      .then((A) => {
        if (cancelled || !box.current) return;
        A.aladin(box.current, { survey: "P/DSS2/color", fov: 0.5, target: `${ra} ${dec}`, showReticle: true,
          showCooGridControl: false, showFullscreenControl: false });
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
          <div ref={box} className="sky-view" data-testid="sky-view" aria-label={`Sky image centered on ${name}`}
            role="img" />
          <p className="muted small">
            Sky image: Digitized Sky Survey, STScI/NASA, colored and made into HiPS by CDS. Viewer: Aladin Lite, CDS
            Strasbourg. The crosshair marks the star.
          </p>
        </>
      )}
    </section>
  );
}
