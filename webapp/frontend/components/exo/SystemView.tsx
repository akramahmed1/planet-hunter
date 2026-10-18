"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import { useWebGL } from "@/components/three/hooks";
import Badge from "@/components/ui/Badge";
import Sheet from "@/components/ui/Sheet";
import Toggle from "@/components/ui/Toggle";
import { useUnits } from "@/components/UnitsProvider";
import type { TargetSystem } from "@/lib/api-v2";
import { formatDec, formatRa, parsecsToLightYears, starDisplayColor } from "@/lib/sky";
import type { ViewFit } from "@/lib/system";
import { formatDistance, formatTemp, KM_PER_AU } from "@/lib/units";
import { buildSystemModel, inConservativeZone } from "./model";
import SystemMap2D, { type Pick } from "./SystemMap2D";

const SystemScene3D = dynamic(() => import("./SystemScene3D"), { ssr: false });

const FIT_OPTIONS = [
  { value: "planets" as const, label: "Planets", title: "Fit the planets" },
  { value: "zone" as const, label: "With zone", title: "Fit the planets and the habitable zone" },
];
const VIEW_OPTIONS = [
  { value: "3d" as const, label: "3D", title: "3D view" },
  { value: "map" as const, label: "Map", title: "Flat map view" },
];

const n = (v: number, d = 2) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function SystemView({ system }: { system: TargetSystem }) {
  const [fit, setFit] = useState<ViewFit>("planets");
  const [view, setView] = useState<"3d" | "map">("3d");
  const [selected, setSelected] = useState<Pick | null>(null);
  const webgl = useWebGL();
  const { temp, distance } = useUnits();
  const model = useMemo(() => buildSystemModel(system, fit), [system, fit]);
  const teff = system.star.effective_temperature?.value ?? 5772;
  const starColor = starDisplayColor(teff);
  const zone = system.habitable_zone;
  const zoneOutside = zone && fit === "planets" && zone.conservative_inner_au > model.extent;
  const picked = selected?.kind === "planet" ? model.planets.find((p) => p.index === selected.index) : null;
  const show3d = view === "3d" && webgl === true;
  const props = { model, starColor, selected, onPick: setSelected };

  return (
    <div className="solar">
      <div className="solar-viewport">
        {show3d ? <SystemScene3D {...props} /> : <SystemMap2D {...props} />}
      </div>
      <p className="muted" data-testid="system-note">
        Orbit sizes and shapes are to scale. Which way each orbit points, and where each planet is along it, are not
        known from these catalogs, so planets are spread out to be easy to tap. The star&apos;s color is a display
        color based on its temperature.
        {system.circumbinary &&
          " These planets orbit both stars of a binary pair. The star's numbers and the habitable zone use the main star only, so treat the zone as a rough guide."}
        {zoneOutside && " The habitable zone is farther out than these planets: choose \"With zone\" to see it."}
      </p>
      {webgl === false && (
        <p className="muted">Your browser cannot show 3D here, so this is a flat view from above.</p>
      )}

      <div className="body-picker" role="group" aria-label="Choose a body">
        <button type="button" className="btn btn--sm" aria-pressed={selected?.kind === "star"}
          onClick={() => setSelected({ kind: "star" })} data-testid="pick-star">
          Star
        </button>
        {model.planets.map((p) => (
          <button key={p.index} type="button" className="btn btn--sm"
            aria-pressed={selected?.kind === "planet" && selected.index === p.index}
            onClick={() => setSelected({ kind: "planet", index: p.index })} data-testid={`pick-planet-${p.index}`}>
            {p.signal ? "Our signal" : p.planet.name.replace(system.host, "").trim() || p.planet.name}
          </button>
        ))}
      </div>

      <div className="solar-controls">
        <Toggle legend="Show" options={FIT_OPTIONS} value={fit} onChange={setFit} />
        {webgl && <Toggle legend="View" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      </div>

      {zone && (
        <p className="legend-row">
          <span className="legend-swatch legend-swatch--zone" aria-hidden="true" /> Habitable zone, where liquid water
          could exist on a rocky planet&apos;s surface (darker band: conservative estimate).{" "}
          <SourceButton label="Habitable zone" source={zone.source} kind={zone.kind} note={zone.note}>
            <span className="muted">Source</span>
          </SourceButton>
        </p>
      )}

      <Sheet open={selected?.kind === "star"} onClose={() => setSelected(null)} title={`${system.target} (the star)`}>
        <dl className="kv kv--text body-kv" data-testid="star-sheet">
          {system.star.effective_temperature && (
            <><dt>Temperature</dt><dd>
              <SourceButton label="Star temperature" source={system.star.effective_temperature.source}
                kind={system.star.effective_temperature.kind} fetchedAt={system.star_fetched_at}>
                <span className="mono">{formatTemp(system.star.effective_temperature.value, temp)}</span>
              </SourceButton></dd></>
          )}
          {system.star.radius_rsun && (
            <><dt>Size</dt><dd>
              <SourceButton label="Star radius" source={system.star.radius_rsun.source} kind={system.star.radius_rsun.kind}
                fetchedAt={system.star_fetched_at}>
                <span className="mono">{n(system.star.radius_rsun.value)} × the Sun</span>
              </SourceButton></dd></>
          )}
          {system.star.luminosity_lsun && (
            <><dt>Brightness</dt><dd>
              <SourceButton label="Star luminosity" source={system.star.luminosity_lsun.source}
                kind={system.star.luminosity_lsun.kind} fetchedAt={system.star_fetched_at}>
                <span className="mono">{n(system.star.luminosity_lsun.value, 3)} × the Sun</span>
              </SourceButton></dd></>
          )}
          {system.star.distance_pc && (
            <><dt>Distance</dt><dd>
              <SourceButton label="Star distance" source={system.star.distance_pc.source} kind={system.star.distance_pc.kind}
                fetchedAt={system.star_fetched_at} note="Light years computed here from parsecs (1 pc = 3.2616 ly).">
                <span className="mono" data-testid="star-distance">
                  {n(parsecsToLightYears(system.star.distance_pc.value), 1)} light years
                </span>
              </SourceButton></dd></>
          )}
          {system.star.ra_deg != null && system.star.dec_deg != null && (
            <><dt>Sky position</dt><dd className="mono">
              RA {formatRa(system.star.ra_deg)}, Dec {formatDec(system.star.dec_deg)}</dd></>
          )}
        </dl>
      </Sheet>

      <Sheet open={!!picked} onClose={() => setSelected(null)} title={picked?.planet.name ?? ""}>
        {picked && (() => {
          const p = picked.planet;
          const inZone = inConservativeZone(picked, zone);
          return (
            <>
              <p>
                {picked.signal ? (
                  <Badge tone="eclipsing">Pipeline signal, not a planet</Badge>
                ) : (
                  <Badge tone="clean">Confirmed planet</Badge>
                )}
              </p>
              {p.note && <p className="muted">{p.note}</p>}
              <dl className="kv kv--text body-kv" data-testid="planet-sheet">
                {p.orbit_au && (
                  <><dt>Distance from its star</dt><dd>
                    <SourceButton label={`${p.name} orbit`} source={p.orbit_au.source} kind={p.orbit_au.kind}
                      note={p.orbit_au.note}>
                      <span className="mono" data-testid="planet-orbit">{formatDistance(p.orbit_au.value * KM_PER_AU, distance)}</span>
                    </SourceButton></dd></>
                )}
                {p.period_days && (
                  <><dt>One orbit (its year)</dt><dd>
                    <SourceButton label={`${p.name} period`} source={p.period_days.source} kind={p.period_days.kind}>
                      <span className="mono">{n(p.period_days.value)} Earth days</span>
                    </SourceButton></dd></>
                )}
                {p.radius_earth && (
                  <><dt>Size</dt><dd>
                    <SourceButton label={`${p.name} radius`} source={p.radius_earth.source} kind={p.radius_earth.kind}>
                      <span className="mono">{n(p.radius_earth.value)} × Earth</span>
                    </SourceButton></dd></>
                )}
                {p.equilibrium_temperature && (
                  <><dt>Temperature (equilibrium)</dt><dd>
                    <SourceButton label={`${p.name} temperature`} source={p.equilibrium_temperature.source}
                      kind={p.equilibrium_temperature.kind} note={p.equilibrium_temperature.note}>
                      <span className="mono" data-testid="planet-temp">{formatTemp(p.equilibrium_temperature.value, temp)}</span>
                    </SourceButton></dd></>
                )}
                {p.eccentricity != null && (
                  <><dt>Orbit shape</dt><dd className="mono">eccentricity {n(p.eccentricity, 3)}</dd></>
                )}
                {p.disc_year && <><dt>Confirmed</dt><dd className="mono">{p.disc_year}</dd></>}
                {inZone !== null && (
                  <><dt>Habitable zone</dt><dd>{inZone ? "Average distance is inside the conservative zone" : "Average distance is outside the conservative zone"}</dd></>
                )}
              </dl>
            </>
          );
        })()}
      </Sheet>
    </div>
  );
}
