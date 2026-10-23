"use client";

import SourceButton from "@/components/live/SourceButton";
import { useUnits } from "@/components/UnitsProvider";
import type { MissionsResponse, SourcedFact } from "@/lib/api-v2";
import { formatDistance, formatLightTime } from "@/lib/units";

function Fact({ label, fact }: { label: string; fact: SourcedFact }) {
  return (
    <SourceButton label={label} source={fact.source} kind="measured" fetchedAt={fact.fetched_at}
      note={`Source wording: "${fact.quote}"`}>
      <span>{fact.display ?? fact.quote}</span>
    </SourceButton>
  );
}

export default function SpacecraftCards({ data }: { data: MissionsResponse }) {
  const { distance } = useUnits();
  return (
    <ul className="tile-grid" data-testid="spacecraft">
      {data.spacecraft.map((c) => (
        <li key={c.id} className="tile" data-testid={`craft-${c.id}`}>
          <p className="eyebrow">{c.name}</p>
          <dl className="kv kv--text craft-kv">
            <dt>From Earth today</dt>
            <dd>
              {c.from_earth ? (
                <SourceButton label={`${c.name} distance from Earth`} source={c.from_earth.source} kind={c.from_earth.kind}
                  fetchedAt={c.from_earth.fetched_at} stale={c.from_earth.stale}>
                  <span className="mono" data-testid="from-earth">{formatDistance(c.from_earth.distance.km, distance)}</span>
                </SourceButton>
              ) : <span className="muted">Unavailable</span>}
            </dd>
            {c.from_earth && (
              <><dt>Radio signal takes</dt><dd className="mono" data-testid="light-time">
                {formatLightTime(c.from_earth.light_time_seconds)}</dd></>
            )}
            <dt>From the Sun</dt>
            <dd>
              {c.from_sun ? (
                <SourceButton label={`${c.name} distance from the Sun`} source={c.from_sun.source} kind={c.from_sun.kind}
                  fetchedAt={c.from_sun.fetched_at} stale={c.from_sun.stale}>
                  <span className="mono">{formatDistance(c.from_sun.distance.km, distance)}</span>
                </SourceButton>
              ) : <span className="muted">Unavailable</span>}
            </dd>
            {c.launch && (
              <><dt>Launched</dt><dd><Fact label={`${c.name} launch`} fact={c.launch} /></dd></>
            )}
            {c.status && (
              <><dt>Status</dt><dd><Fact label={`${c.name} status`} fact={c.status} /></dd></>
            )}
          </dl>
          {c.note && <p className="muted small">{c.note}</p>}
        </li>
      ))}
    </ul>
  );
}
