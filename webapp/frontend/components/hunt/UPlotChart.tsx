"use client";

import { useEffect, useRef, useState } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export type ChartSeries = { label: string; color: string; points?: boolean; width?: number };

/**
 * A thin React wrapper around uPlot (MIT). Data is uPlot's column format:
 * [xs, ys1, ys2, ...]. Drag across the plot to zoom in on x; the parent can
 * also set the x range (zoom buttons, fold window) through `xRange`.
 */
export default function UPlotChart({
  data,
  series,
  xLabel,
  yLabel,
  height = 240,
  xRange,
  onXRange,
  marker,
  guess,
  bands,
  onPick,
  ariaLabel,
  testId,
  yFormat,
}: {
  data: (number | null)[][];
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
  xRange?: [number, number] | null;
  onXRange?: (r: [number, number]) => void;
  marker?: number | null;
  /** A second, solid marker: where the viewer's own period guess sits on this chart. */
  guess?: number | null;
  /** Shaded stretches of the x axis (for example where a transit would fall at the guessed period). */
  bands?: { from: number; to: number }[];
  /** Called with the x value under a tap or click that was not a drag. */
  onPick?: (x: number) => void;
  ariaLabel: string;
  testId?: string;
  /** "sci" shows small values like 2.1e-4 instead of rounding them to 0. */
  yFormat?: "sci";
}) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [failed, setFailed] = useState(false);
  const markerRef = useRef(marker);
  markerRef.current = marker;
  const guessRef = useRef(guess);
  guessRef.current = guess;
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      let U: typeof uPlot;
      try {
        U = (await import("uplot")).default;
      } catch {
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed || !box.current) return;
      const width = box.current.clientWidth || 320;
      const opts: uPlot.Options = {
        width,
        height,
        legend: { show: false },
        cursor: { drag: { x: true, y: false, setScale: true }, points: { show: false } },
        scales: { x: { time: false } },
        axes: [
          { label: xLabel, stroke: "#b4bdd6", grid: { stroke: "#1f2b47" }, ticks: { stroke: "#1f2b47" },
            values: (_u: uPlot, vals: number[]) => vals.map((v) => v.toLocaleString("en-US", { maximumFractionDigits: 3 })) },
          { label: yLabel, stroke: "#b4bdd6", grid: { stroke: "#1f2b47" }, ticks: { stroke: "#1f2b47" }, size: 64,
            values: (_u: uPlot, vals: number[]) =>
              vals.map((v) => (yFormat === "sci" ? (v === 0 ? "0" : v.toExponential(1)) : v.toLocaleString("en-US"))) },
        ],
        series: [
          {},
          ...series.map((s) => ({
            label: s.label,
            stroke: s.color,
            width: s.points ? 0 : (s.width ?? 1.5),
            points: s.points ? { show: true, size: 3, fill: s.color, stroke: s.color } : { show: false },
            paths: s.points ? () => null : undefined,
          })),
        ],
        hooks: {
          setScale: [
            (u, key) => {
              if (key === "x" && onXRange && u.scales.x.min != null && u.scales.x.max != null) {
                onXRange([u.scales.x.min, u.scales.x.max]);
              }
            },
          ],
          // Bands go behind the data, so a dip is never hidden by its own shading.
          drawClear: [
            (u) => {
              const list = bandsRef.current;
              if (!list?.length) return;
              const ctx = u.ctx;
              ctx.save();
              ctx.fillStyle = "rgba(79, 224, 176, 0.38)";
              for (const b of list) {
                const x0 = u.valToPos(b.from, "x", true);
                const x1 = u.valToPos(b.to, "x", true);
                // At least a hair wide, or a short transit on a long chart would vanish.
                ctx.fillRect(x0, u.bbox.top, Math.max(x1 - x0, 3 * devicePixelRatio), u.bbox.height);
              }
              ctx.restore();
            },
          ],
          draw: [
            (u) => {
              const line = (v: number | null | undefined, color: string, dash: number[]) => {
                if (v == null) return;
                const x = u.valToPos(v, "x", true);
                const ctx = u.ctx;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2 * devicePixelRatio;
                ctx.setLineDash(dash.map((d) => d * devicePixelRatio));
                ctx.beginPath();
                ctx.moveTo(x, u.bbox.top);
                ctx.lineTo(x, u.bbox.top + u.bbox.height);
                ctx.stroke();
                ctx.restore();
              };
              line(markerRef.current, "#ffb547", [6, 4]);
              line(guessRef.current, "#eef1fa", []);
            },
          ],
          ready: [
            (u) => {
              // A tap that did not move is a pick; a drag is a zoom, handled by uPlot itself.
              let down: { x: number; y: number } | null = null;
              u.over.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
              u.over.addEventListener("pointerup", (e) => {
                if (!down || !pickRef.current) return;
                const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
                down = null;
                if (moved > 5) return;
                const r = u.over.getBoundingClientRect();
                pickRef.current(u.posToVal(e.clientX - r.left, "x"));
              });
            },
          ],
        },
      };
      try {
        plot.current = new U(opts, data as uPlot.AlignedData, box.current);
      } catch {
        setFailed(true);
        return;
      }
      ro = new ResizeObserver(() => {
        if (box.current && plot.current) plot.current.setSize({ width: box.current.clientWidth, height });
      });
      ro.observe(box.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Rebuild only when the series layout changes; data updates go through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.length, height, xLabel, yLabel]);

  useEffect(() => {
    plot.current?.setData(data as uPlot.AlignedData, !xRange);
  }, [data, xRange]);

  useEffect(() => {
    const u = plot.current;
    if (!u) return;
    if (xRange) u.setScale("x", { min: xRange[0], max: xRange[1] });
    u.redraw();
  }, [xRange, marker, guess, bands]);

  if (failed) {
    return (
      <p className="error-box" role="alert">
        This interactive chart could not be drawn in this browser. The pipeline&apos;s static plot is further down the
        page.
      </p>
    );
  }
  return <div ref={box} className="uplot-box" role="img" aria-label={ariaLabel} data-testid={testId}
    data-guess={guess ?? undefined} data-bands={bands?.length} />;
}
