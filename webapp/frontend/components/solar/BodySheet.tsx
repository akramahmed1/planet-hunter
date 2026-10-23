"use client";

import type { ReactNode } from "react";
import SourceButton from "@/components/live/SourceButton";
import Sheet from "@/components/ui/Sheet";
import { useUnits } from "@/components/UnitsProvider";
import type { Body, Position, SourceRef, TemperatureStatement } from "@/lib/api-v2";
import {
  BODY_NAMES,
  CMB_KELVIN,
  CMB_SOURCE,
  formatDuration,
  formatPeriodDays,
  neighbours,
  orbitGapKm,
  separation,
  type SceneBodyId,
  type Vec3,
} from "@/lib/solar";
import { formatDistance, formatLightTime, formatTemp, type TempUnit } from "@/lib/units";
import Tap from "@/components/ui/Tap";

const WMAP_SOURCE = { name: "NASA Science: WMAP overview", url: "https://science.nasa.gov/mission/wmap/wmap-overview/" };

function vec(p: Position): Vec3 {
  return [p.x_au, p.y_au, p.z_au];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function tempText(t: TemperatureStatement, unit: TempUnit): string {
  const about = t.approximate ? "about " : "";
  if (t.value) return `${about}${formatTemp(t.value.kelvin, unit)}`;
  if (t.low && t.high) return `${about}${formatTemp(t.low.kelvin, unit)} to ${formatTemp(t.high.kelvin, unit)}`;
  return "not listed";
}

/** Where a distance computed from two positions came from, for its source sheet. */
function computedFrom(a: Position, b: Position, date: string): { source: SourceRef; note: string } {
  const name = (p: Position) => BODY_NAMES[p.id as SceneBodyId] ?? p.id;
  return {
    source: a.kind === "measured" ? a.source : b.source,
    note:
      `Computed here as the straight-line distance between the two positions for ${date}. ` +
      `${name(a)}: ${a.source.name}. ${name(b)}: ${b.source.name}. Light time uses c = 299,792.458 km/s.`,
  };
}

export function BodySheet({
  id,
  body,
  bodies,
  positions,
  date,
  onClose,
  onZoom,
}: {
  id: SceneBodyId | null;
  body: Body | null;
  bodies: Record<string, Body>;
  positions: Record<string, Position>;
  date: string;
  onClose: () => void;
  onZoom?: (id: SceneBodyId) => void;
}) {
  const { temp, distance } = useUnits();
  const open = id !== null && body !== null;
  const pos = id ? positions[id] : undefined;
  const earth = positions.earth;
  const sun = positions.sun;

  return (
    <Sheet open={open} onClose={onClose} title={id ? BODY_NAMES[id] : ""}>
      {open && body && (
        <>
        <p className="muted">
          Distances for <span className="mono nowrap">{date}</span>. <Tap /> any value for its source.
        </p>
        {onZoom && id && id !== "sun" && (
          <button type="button" className="btn btn--sm" onClick={() => onZoom(id)} data-testid="zoom-to">
            Zoom to {BODY_NAMES[id]}
          </button>
        )}
        <dl className="kv kv--text body-kv" data-testid="body-sheet">
          {body.temperatures.map((t) => (
            <Row key={t.label} label={t.label}>
              <SourceButton label={`${body.name} ${t.label.toLowerCase()}`} source={t.source} kind={t.kind}
                note={`NSSDCA wording: "${t.quote}"`}>
                <span className="mono" data-testid="temp-value">{tempText(t, temp)}</span>
              </SourceButton>
            </Row>
          ))}

          {pos && sun && id !== "sun" && (
            <Row label="From the Sun">
              <SourceButton label={`${body.name} distance from the Sun`} source={pos.source} kind={pos.kind}
                fetchedAt={pos.fetched_at} stale={pos.stale} note={pos.note}>
                <span className="mono" data-testid="sun-distance">
                  {formatDistance(separation(vec(pos), vec(sun)).km, distance)}
                </span>
              </SourceButton>
            </Row>
          )}

          {body.semimajor_axis && (
            <Row label="Average distance from the Sun">
              <SourceButton label={`${body.name} average distance`} source={body.semimajor_axis.source}
                kind={body.semimajor_axis.kind}>
                <span className="mono">{formatDistance(body.semimajor_axis.value * 1e6, distance)}</span>
              </SourceButton>
            </Row>
          )}

          {id &&
            (["inner", "outer"] as const).map((side) => {
              const other = neighbours(id)[side];
              const a = body.semimajor_axis;
              const b = other ? bodies[other]?.semimajor_axis : null;
              if (!other || !a || !b) return null;
              return (
                <Row key={side} label={`Orbit gap to ${BODY_NAMES[other]}`}>
                  <SourceButton label={`Gap between ${body.name} and ${BODY_NAMES[other]}`} source={a.source}
                    kind="computed" note="The difference between the two average distances from the Sun.">
                    <span className="mono">{formatDistance(orbitGapKm(a.value * 1e6, b.value * 1e6), distance)}</span>
                  </SourceButton>
                </Row>
              );
            })}

          {pos && earth && id !== "earth" && (() => {
            const s = separation(vec(pos), vec(earth));
            const from = computedFrom(pos, earth, date);
            return (
              <>
                <Row label="From Earth">
                  <SourceButton label={`${body.name} distance from Earth`} source={from.source} kind="computed"
                    note={from.note}>
                    <span className="mono" data-testid="earth-distance">{formatDistance(s.km, distance)}</span>
                  </SourceButton>
                </Row>
                <Row label="Light takes">
                  <SourceButton label={`Light time from ${body.name} to Earth`} source={from.source} kind="computed"
                    note={from.note}>
                    <span className="mono" data-testid="light-time">{formatLightTime(s.lightSeconds)}</span>
                  </SourceButton>
                </Row>
              </>
            );
          })()}

          {body.day_length && (
            <Row label="Length of day">
              <SourceButton label={`${body.name} day length`} source={body.day_length.source} kind={body.day_length.kind}
                note="Sunrise to sunrise (the NSSDCA 'length of day').">
                <span className="mono">{formatDuration(body.day_length.value)}</span>
              </SourceButton>
            </Row>
          )}

          {body.orbit_period && (
            <Row label="Length of year">
              <SourceButton label={`${body.name} year length`} source={body.orbit_period.source}
                kind={body.orbit_period.kind} note="One trip around the Sun (the NSSDCA sidereal orbit period).">
                <span className="mono">{formatPeriodDays(body.orbit_period.value)}</span>
              </SourceButton>
            </Row>
          )}
        </dl>
        </>
      )}
    </Sheet>
  );
}

export function DeepSpaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { temp } = useUnits();
  const others = (["F", "C", "K"] as const).filter((u) => u !== temp);
  return (
    <Sheet open={open} onClose={onClose} title="Deep space">
      <div data-testid="deep-space">
        <div>
          <SourceButton label="Temperature of deep space" source={CMB_SOURCE} kind="measured"
            note={`Measured value: 2.72548 K, give or take 0.00057 K. NASA's WMAP mission page (${WMAP_SOURCE.url}) gives sky temperatures of 2.7251 K and 2.7249 K.`}>
            <span className="tile-value mono" data-testid="deep-space-temp">about {formatTemp(CMB_KELVIN, temp, temp === "K" ? 1 : 0)}</span>
          </SourceButton>
        </div>
        <p className="muted">
          That is about {others.map((u) => formatTemp(CMB_KELVIN, u, u === "K" ? 1 : 0)).join(" or ")}, just above
          absolute zero.
        </p>
        <p>
          Space between the stars is almost empty, so there is almost no air or anything else to be hot or cold.
          Temperature measures how fast particles move, and a vacuum has very few particles to carry it.
        </p>
        <p>
          The 2.7 K figure is the temperature of the faint glow left over from the early universe, called the cosmic
          microwave background. It fills all of space. Something drifting far from any star would slowly cool until
          it matched it. Near the Sun, sunlight heats things far more.
        </p>
      </div>
    </Sheet>
  );
}
