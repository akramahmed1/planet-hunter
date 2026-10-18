"use client";

import type { KeyboardEvent } from "react";
import type { SystemModel } from "./model";

export type Pick = { kind: "star" } | { kind: "planet"; index: number };

function ring(inner: number, outer: number): string {
  // Two circles in one path; even-odd fill leaves the middle empty.
  const c = (r: number) => `M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`;
  return `${c(outer)} ${c(inner)}`;
}

/** Top-down view of a planetary system: the first paint, and the view without WebGL. */
export default function SystemMap2D({
  model,
  starColor,
  selected,
  onPick,
}: {
  model: SystemModel;
  starColor: string;
  selected: Pick | null;
  onPick: (p: Pick) => void;
}) {
  const E = model.extent;
  const dot = E * 0.025;
  const key = (e: KeyboardEvent, p: Pick) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(p);
    }
  };
  const z = model.zone;
  return (
    <svg className="orbit-map" viewBox={`${-E} ${-E} ${2 * E} ${2 * E}`} role="group"
      aria-label="Top-down view of the planetary system" data-testid="system-map">
      {z && (
        <g pointerEvents="none" data-testid="habitable-zone">
          <path d={ring(z.optimistic_inner_au, z.optimistic_outer_au)} fill="var(--aurora)" fillOpacity={0.12}
            fillRule="evenodd" />
          <path d={ring(z.conservative_inner_au, z.conservative_outer_au)} fill="var(--aurora)" fillOpacity={0.22}
            fillRule="evenodd" />
        </g>
      )}
      {model.planets.map((p) => (
        <polygon key={`o${p.index}`} points={p.orbit.map(([x, y]) => `${x},${-y}`).join(" ")} fill="none"
          stroke={p.signal ? "var(--flare)" : "var(--line-strong)"} strokeWidth={1.5}
          strokeDasharray={p.signal ? "5 4" : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      ))}
      <g role="button" tabIndex={0} aria-label="The star" className="map-body" data-testid="system-star"
        aria-pressed={selected?.kind === "star" || undefined}
        onClick={() => onPick({ kind: "star" })} onKeyDown={(e) => key(e, { kind: "star" })}>
        <circle r={Math.max(model.starRadius, dot * 1.6)} fill={starColor} />
      </g>
      {model.planets.map((p) => {
        const [x, y] = p.at;
        const on = selected?.kind === "planet" && selected.index === p.index;
        return (
          <g key={p.index} role="button" tabIndex={0} aria-label={p.planet.name} className="map-body"
            aria-pressed={on || undefined} data-testid={`system-planet-${p.index}`}
            onClick={() => onPick({ kind: "planet", index: p.index })}
            onKeyDown={(e) => key(e, { kind: "planet", index: p.index })}>
            <circle cx={x} cy={-y} r={dot * 2.2} fill="transparent" />
            {on && <circle cx={x} cy={-y} r={dot * 1.9} fill="none" stroke="var(--ion-strong)" strokeWidth={2}
              vectorEffect="non-scaling-stroke" />}
            <circle cx={x} cy={-y} r={dot} fill={p.signal ? "var(--flare)" : "var(--ion)"} />
          </g>
        );
      })}
    </svg>
  );
}
