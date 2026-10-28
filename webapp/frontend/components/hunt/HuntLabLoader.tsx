"use client";

import { useEffect, useState } from "react";
import { apiV2Send, type LightCurveResponse, type PeriodogramResponse } from "@/lib/api-v2";
import HuntLab from "./HuntLab";

type Data = { lc: LightCurveResponse; pg: PeriodogramResponse };

/**
 * Loads a candidate's light curve and periodogram in the browser. They are about 130 KB of numbers; sent inside the
 * page they made it several times heavier than it needs to be, so the page ships the words first and the charts follow.
 * The responses are cached by the browser for a day.
 */
export default function HuntLabLoader({ slug, answerPeriod, classification }: { slug: string; answerPeriod: number; classification: string }) {
  const [data, setData] = useState<Data | null | undefined>(undefined); // undefined: loading; null: failed
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setData(undefined);
    const id = encodeURIComponent(slug);
    Promise.all([
      apiV2Send<LightCurveResponse>("GET", `/api/v2/lightcurves/${id}`),
      apiV2Send<PeriodogramResponse>("GET", `/api/v2/periodogram/${id}`),
    ]).then(([a, b]) => {
      if (live) setData(a.ok && b.ok ? { lc: a.data, pg: b.data } : null);
    });
    return () => {
      live = false;
    };
  }, [slug, attempt]);

  if (data === undefined) {
    return (
      <div className="card hunt-card hunt-loading" aria-busy="true" data-testid="hunt-loading">
        <p className="muted">Loading the light curve...</p>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="card hunt-card hunt-loading" role="alert" data-testid="hunt-failed">
        <p>The light curve could not be loaded just now.</p>
        <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </div>
    );
  }
  return <HuntLab lc={data.lc} pg={data.pg} answerPeriod={answerPeriod} classification={classification} />;
}
