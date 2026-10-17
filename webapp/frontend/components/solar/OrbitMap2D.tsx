"use client";

import type { KeyboardEvent } from "react";
import { BODY_COLORS, BODY_NAMES, type SceneBodyId } from "@/lib/solar";
import { markerRadius, type SceneModel } from "./model";

/**
 * Top-down orbit map (looking down on the plane of Earth's orbit). Used when
 * WebGL is missing, when the viewer picks "Map", and as the first paint while
 * the 3D view loads. Every body is a focusable button.
 */
export default function OrbitMap2D({
  model,
  highlight,
  line,
  onPick,
  onEmpty,
}: {
  model: SceneModel;
  highlight: SceneBodyId[];
  line: [SceneBodyId, SceneBodyId] | null;
  onPick: (id: SceneBodyId) => void;
  onEmpty: () => void;
}) {
  const E = model.extent;
  // Screen y grows downward; flip so the map matches the usual ecliptic view.
  const xy = (p: readonly number[]) => [p[0], -p[1]] as const;
  const at = Object.fromEntries(model.bodies.map((b) => [b.id, xy(b.p)])) as Record<SceneBodyId, readonly [number, number]>;
  const hitR = E * 0.035;
  const font = E * 0.042;

  function key(e: KeyboardEvent, id: SceneBodyId) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(id);
    }
  }

  return (
    <svg
      className="orbit-map"
      viewBox={`${-E} ${-E} ${2 * E} ${2 * E}`}
      role="group"
      aria-label="Top-down map of the solar system"
      data-testid="orbit-map"
    >
      <rect
        x={-E}
        y={-E}
        width={2 * E}
        height={2 * E}
        fill="transparent"
        onClick={onEmpty}
        data-testid="map-space"
      />
      {model.orbits.map((o) => (
        <polygon
          key={o.id}
          points={o.points.map((p) => xy(p).join(",")).join(" ")}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}
      {line && at[line[0]] && at[line[1]] && (
        <line
          x1={at[line[0]][0]}
          y1={at[line[0]][1]}
          x2={at[line[1]][0]}
          y2={at[line[1]][1]}
          stroke="var(--aurora)"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          data-testid="measure-line"
        />
      )}
      {model.bodies.filter(({ p }) => Math.hypot(p[0], p[1]) <= E).map(({ id }) => {
        const [x, y] = at[id];
        const r = markerRadius(id, E);
        const on = highlight.includes(id);
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-label={BODY_NAMES[id]}
            aria-pressed={on || undefined}
            className="map-body"
            onClick={(e) => {
              e.stopPropagation();
              onPick(id);
            }}
            onKeyDown={(e) => key(e, id)}
            data-testid={`map-body-${id}`}
          >
            <circle cx={x} cy={y} r={hitR} fill="transparent" />
            {on && (
              <circle cx={x} cy={y} r={r * 2} fill="none" stroke="var(--ion-strong)" strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
            )}
            <circle cx={x} cy={y} r={r} fill={BODY_COLORS[id]} />
            {/* Labels near the Sun would pile up; the inner planets are named in "Inner planets" view. */}
            {id !== "sun" && Math.hypot(x, y) > E * 0.12 && (
              <text x={x + r * 1.6} y={y - r * 1.6} fontSize={font} fill="var(--ink-dim)" aria-hidden="true">
                {BODY_NAMES[id]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
