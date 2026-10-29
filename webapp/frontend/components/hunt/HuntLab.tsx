"use client";

import { useId, useMemo, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import type { LightCurveResponse, PeriodogramResponse } from "@/lib/api-v2";
import { foldBinned, foldWindow, phaseOf, scoreGuess, snapToPeak, transitWindows, type Score } from "@/lib/hunt";
import CsvDownload from "@/components/ui/CsvDownload";
import UPlotChart from "./UPlotChart";

const START_DAYS = 3; // where the slider begins: arbitrary, and the page says so
const P_MIN = 0.5;
const P_MAX = 30;
const STEPS = 20000; // about 0.02% per step
// Log-spaced slider, so short and long periods are equally easy to reach.
const toPeriod = (s: number) => P_MIN * Math.pow(P_MAX / P_MIN, s / STEPS);
const toStep = (p: number) => Math.round((STEPS * Math.log(p / P_MIN)) / Math.log(P_MAX / P_MIN));

const LC_SERIES = [{ label: "Brightness", color: "#7cc4ff", points: true }];
const FOLD_SERIES = [
  { label: "Every point", color: "rgba(124,196,255,0.35)", points: true },
  { label: "Median", color: "#ffb547", width: 2 },
];
const PG_SERIES = [{ label: "BLS power", color: "#4fe0b0", width: 1.5 }];

export default function HuntLab({ lc, pg, answerPeriod, classification }: {
  lc: LightCurveResponse;
  pg: PeriodogramResponse;
  answerPeriod: number;
  classification: string;
}) {
  const [xRange, setXRange] = useState<[number, number] | null>(null);
  const [step, setStep] = useState(toStep(START_DAYS));
  // "Fold there" sets the pipeline's exact period; the slider only reaches steps about 0.02% apart.
  const [exactPeriod, setExactPeriod] = useState<number | null>(START_DAYS); // exactly 3.0000, not the nearest slider step
  const [score, setScore] = useState<Score | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scoredAfterReveal, setScoredAfterReveal] = useState(false);
  const [whole, setWhole] = useState(false);
  const sliderId = useId();
  const helpId = useId();
  const period = exactPeriod ?? toPeriod(step);
  const t0 = lc.signal.t0_btjd;

  const lcData = useMemo(() => [lc.time_btjd, lc.flux_ppm], [lc]);
  const pgData = useMemo(() => [pg.period_d, pg.power], [pg]);
  // Show about five transit durations around the dip (at least 2% of the orbit), or the whole orbit.
  const half = Math.min(0.5, Math.max(0.02, (5 * lc.signal.duration_d) / period));
  const foldData = useMemo(() => {
    if (!whole) {
      const w = foldWindow(lc.time_btjd, lc.flux_ppm, period, t0, half);
      return [w.x, w.y, w.median];
    }
    // Sort by phase so uPlot draws left to right; the median line comes from 100 phase bins.
    const pts = lc.time_btjd.map((t, i) => [phaseOf(t, period, t0) / period, lc.flux_ppm[i]] as const);
    pts.sort((a, b) => a[0] - b[0]);
    const bins = foldBinned(lc.time_btjd, lc.flux_ppm, period, t0, 100);
    const binAt = (ph: number) => bins[Math.min(99, Math.floor((ph + 0.5) * 100))];
    return [pts.map((p) => p[0]), pts.map((p) => p[1]), pts.map((p) => binAt(p[0]))];
  }, [lc, period, t0, whole, half]);

  const span = lc.time_btjd[lc.time_btjd.length - 1] - lc.time_btjd[0];
  // Linked views: the period chosen anywhere shows on the light curve (where a dip would land) and on the periodogram.
  const bands = useMemo(
    () => transitWindows(t0, period, lc.signal.duration_d, lc.time_btjd[0], lc.time_btjd[lc.time_btjd.length - 1]),
    [t0, period, lc],
  );
  const pickPeriod = (x: number) => {
    const p = snapToPeak(pg.period_d, pg.power, x);
    if (p == null) return;
    setExactPeriod(p);
    setStep(toStep(Math.min(P_MAX, Math.max(P_MIN, p))));
    setScore(null);
  };
  const zoom = (f: number) => {
    const [a, b] = xRange ?? [lc.time_btjd[0], lc.time_btjd[lc.time_btjd.length - 1]];
    const mid = (a + b) / 2;
    const half = Math.min(span / 2, ((b - a) / 2) * f);
    setXRange([mid - half, mid + half]);
  };
  const pan = (f: number) => {
    const [a, b] = xRange ?? [lc.time_btjd[0], lc.time_btjd[lc.time_btjd.length - 1]];
    const d = (b - a) * f;
    setXRange([a + d, b + d]);
  };
  const nudge = (pct: number) => {
    setExactPeriod(null);
    setStep(toStep(Math.min(P_MAX, Math.max(P_MIN, period * (1 + pct)))));
  };

  const sourceNote = `${lc.processing} Binning: ${lc.binning.method}. Sectors ${lc.sectors.join(", ")}.`;

  return (
    <div className="hunt">
      <section aria-labelledby="lc-h" className="card hunt-card">
        <h2 id="lc-h" className="card-title">The light curve</h2>
        <p className="muted">
          Brightness of {lc.target} over {Math.round(span)} days, in parts per million (ppm) from normal. Drag across
          the chart to zoom in. The green bands show where a dip would land at the period you have chosen.{" "}
          <SourceButton label={`${lc.target} light curve`} source={lc.source} kind="measured"
            fetchedAt={lc.fetched_at} note={sourceNote}>
            <span>Source</span>
          </SourceButton>
        </p>
        <UPlotChart data={lcData} series={LC_SERIES} xLabel="Time (BTJD days)" yLabel="ppm" xRange={xRange}
          onXRange={setXRange} bands={bands} ariaLabel={`Light curve of ${lc.target}`} testId="lc-chart" />
        <CsvDownload
          label="Download the light curve (CSV)"
          fileParts={[lc.target, "light curve"]}
          note={`${lc.time_btjd.length.toLocaleString("en-US")} points, time in BTJD days, flux in ppm from normal.`}
          rows={() => [["time_btjd", "flux_ppm"], ...lc.time_btjd.map((t, i) => [t, lc.flux_ppm[i]])]}
        />
        <div className="btn-row">
          <button type="button" className="btn btn--sm" onClick={() => zoom(0.5)}>Zoom in</button>
          <button type="button" className="btn btn--sm" onClick={() => zoom(2)}>Zoom out</button>
          <button type="button" className="btn btn--sm" onClick={() => pan(-0.5)} aria-label="Pan left">←</button>
          <button type="button" className="btn btn--sm" onClick={() => pan(0.5)} aria-label="Pan right">→</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setXRange(null)}>Reset</button>
        </div>
      </section>

      <section aria-labelledby="fold-h" className="card hunt-card" data-testid="challenge">
        <h2 id="fold-h" className="card-title">Find the dip</h2>
        <p>
          A planet dips the light once every orbit. Fold the light curve at the right period and all the dips stack
          into one. Slide to find it.
        </p>
        <p className="muted" id={helpId} data-testid="start-help">
          The slider starts at {START_DAYS} days only because it has to start somewhere; that is not a hint. The dips
          line up only when the period is right to within a fraction of a percent. Look at the periodogram below for
          tall peaks, slide toward one, then sharpen with the 0.1% buttons.
        </p>
        <label htmlFor={sliderId} className="select-label">
          Period: <span className="mono" data-testid="guess-period">{period.toFixed(4)} days</span>
        </label>
        <input id={sliderId} type="range" min={0} max={STEPS} value={step} aria-describedby={helpId} onChange={(e) => {
          setExactPeriod(null);
          setStep(Number(e.target.value));
          setScore(null);
        }} data-testid="period-slider" className="hunt-slider" />
        <div className="btn-row">
          <button type="button" className="btn btn--sm" onClick={() => nudge(-0.001)}>−0.1%</button>
          <button type="button" className="btn btn--sm" onClick={() => nudge(0.001)}>+0.1%</button>
          <button type="button" className="btn btn--sm" onClick={() => nudge(-0.01)}>−1%</button>
          <button type="button" className="btn btn--sm" onClick={() => nudge(0.01)}>+1%</button>
          <button type="button" className="btn btn--sm btn--ghost" data-testid="start-over" onClick={() => {
            setExactPeriod(START_DAYS);
            setStep(toStep(START_DAYS));
            setScore(null);
          }}>Start over at {START_DAYS} days</button>
        </div>
        <label className="toggle-inline">
          <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Show the whole orbit
        </label>
        <UPlotChart key={whole ? "whole" : "window"} data={foldData} series={FOLD_SERIES}
          xLabel={whole ? "Phase (fraction of the period)" : "Phase near the dip (fraction of the period)"} yLabel="ppm"
          ariaLabel={`Light curve folded at ${period.toFixed(4)} days`} testId="fold-chart" />
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => { setScore(scoreGuess(period, answerPeriod)); setScoredAfterReveal(revealed); }}
            data-testid="check-guess">Check my period</button>
          <button type="button" className="btn btn--ghost" onClick={() => setRevealed(true)}>Show the answer</button>
        </div>
        <div aria-live="polite">
          {score && (
            <p data-testid="score">
              <strong>{score.points} points.</strong> {score.message}
              {scoredAfterReveal && " You had looked at the answer first, so this one is practice, not a score."}
            </p>
          )}
          {revealed && (
            <p data-testid="answer">
              Our pipeline found <span className="mono">{answerPeriod.toFixed(4)} days</span>.{" "}
              <button type="button" className="btn btn--sm" onClick={() => {
                setStep(toStep(answerPeriod));
                setExactPeriod(answerPeriod);
              }}>Fold there</button>
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="pg-h" className="card hunt-card">
        <h2 id="pg-h" className="card-title">The periodogram</h2>
        <p className="muted">
          The pipeline tries every period from {P_MIN} to {P_MAX} days and scores how well a box-shaped dip fits. The
          tallest peak (dashed line) is its best guess. Tap the chart beside a peak to fold the light curve there; the white
          line shows the period you have chosen. The slider does the same, one step at a time.
        </p>
        <UPlotChart data={pgData} series={PG_SERIES} xLabel="Period (days)" yLabel="BLS power" yFormat="sci"
          marker={lc.signal.period_d} guess={period} onPick={pickPeriod} ariaLabel={`Periodogram of ${lc.target} with the peak at ${lc.signal.period_d} days`}
          testId="pg-chart" />
        <p className="muted small">{pg.method}.</p>
      </section>

      <section aria-labelledby="eb-h" className="card hunt-card">
        <h2 id="eb-h" className="card-title">Planet or eclipsing binary?</h2>
        <p>
          Two stars orbiting each other can also make repeating dips when one passes in front of the other. Clues
          that it is a pair of stars: the dips are often deep, V-shaped instead of
          flat-bottomed, and every other dip is a different depth, because the two stars are not equally bright.
          Folding at double the period shows two dips of different depths.
        </p>
        {classification === "eclipsing-binary" && (
          <p className="callout" role="note">
            Our review classified {lc.target} as an eclipsing binary, not a planet. Try folding at double the
            pipeline&apos;s period and compare the two dips.
          </p>
        )}
      </section>
    </div>
  );
}
