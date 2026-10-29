"use client";

import { useEffect, useId, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import { useUnits } from "@/components/UnitsProvider";
import type { Position } from "@/lib/api-v2";
import { PLAY_SPEEDS, type PlaySpeedId } from "@/lib/orbitPlay";
import { addDays, BODY_NAMES, clampDate, daysBetween, separation, type SceneBodyId } from "@/lib/solar";
import Toggle from "@/components/ui/Toggle";
import type { TourStop } from "@/lib/tour";
import { formatDistance, formatLightTime } from "@/lib/units";
import Tap from "@/components/ui/Tap";

export function MeasurePanel({
  picks,
  positions,
  date,
  onClear,
}: {
  picks: SceneBodyId[];
  positions: Record<string, Position>;
  date: string;
  onClear: () => void;
}) {
  const { distance } = useUnits();
  const [a, b] = picks;
  const pa = a ? positions[a] : undefined;
  const pb = b ? positions[b] : undefined;
  return (
    <section className="card solar-panel" aria-labelledby="measure-h" data-testid="measure-panel">
      <h2 id="measure-h" className="card-title">Measure</h2>
      {!a && <p><Tap /> a body, then <Tap lower /> a second one to see the distance between them.</p>}
      {a && !b && <p>{BODY_NAMES[a]} selected. Now <Tap lower /> a second body.</p>}
      {pa && pb && (() => {
        const s = separation([pa.x_au, pa.y_au, pa.z_au], [pb.x_au, pb.y_au, pb.z_au]);
        const note =
          `Computed here as the straight-line distance between the two positions for ${date}. ` +
          `${BODY_NAMES[a]}: ${pa.source.name}. ${BODY_NAMES[b]}: ${pb.source.name}.`;
        const source = pa.kind === "measured" ? pa.source : pb.source;
        return (
          <div aria-live="polite">
            <p>
              {BODY_NAMES[a]} to {BODY_NAMES[b]} on {date}:
            </p>
            <div>
              <SourceButton label={`Distance from ${BODY_NAMES[a]} to ${BODY_NAMES[b]}`} source={source}
                kind="computed" note={note}>
                <span className="tile-value mono" data-testid="measure-distance">{formatDistance(s.km, distance)}</span>
              </SourceButton>
            </div>
            <p className="muted" data-testid="measure-light">
              Light takes {formatLightTime(s.lightSeconds)} to cross it.
            </p>
          </div>
        );
      })()}
      {a && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClear}>
          Clear
        </button>
      )}
    </section>
  );
}

export function TourPanel({
  stops,
  index,
  onIndex,
}: {
  stops: TourStop[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const stop = stops[index];
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const group = useId();
  useEffect(() => {
    setChoice(null);
    setChecked(false);
  }, [index]);
  if (!stop) return null;
  const right = checked && choice === stop.quiz.answer;
  return (
    <section className="card solar-panel" aria-labelledby="tour-h" data-testid="tour-panel">
      <p className="eyebrow">
        Stop {index + 1} of {stops.length}
      </p>
      <h2 id="tour-h" className="card-title" data-testid="tour-title">{stop.title}</h2>
      <div className="tour-fact">
        {stop.fact}{" "}
        <SourceButton label={`${stop.title} fact`} source={stop.source} kind={stop.kind}>
          <span className="muted">Source</span>
        </SourceButton>
      </div>
      <fieldset className="quiz">
        <legend>Quick question (optional): {stop.quiz.question}</legend>
        {stop.quiz.options.map((o, i) => (
          <label key={o} className="quiz-option">
            <input
              type="radio"
              name={group}
              checked={choice === i}
              onChange={() => {
                setChoice(i);
                setChecked(false);
              }}
            />{" "}
            {o}
          </label>
        ))}
        <button type="button" className="btn btn--sm" disabled={choice === null} onClick={() => setChecked(true)}>
          Check
        </button>
        <p aria-live="polite" data-testid="quiz-result">
          {checked && (right ? `Yes! ${stop.quiz.explain}` : `Not quite. ${stop.quiz.explain}`)}
        </p>
      </fieldset>
      <div className="btn-row">
        <button type="button" className="btn" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          Back
        </button>
        <button type="button" className="btn btn--primary" disabled={index === stops.length - 1}
          onClick={() => onIndex(index + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}

export function DateControl({
  date,
  today,
  from,
  to,
  loading,
  onDate,
}: {
  date: string;
  today: string;
  from: string;
  to: string;
  loading: boolean;
  onDate: (d: string) => void;
}) {
  const sliderId = useId();
  const pickerId = useId();
  const max = daysBetween(from, to);
  return (
    <div className="date-control">
      <label htmlFor={sliderId} className="select-label">
        Date <span className="mono">{date}</span> {loading && <span className="muted">(loading)</span>}
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={max}
        step={1}
        value={daysBetween(from, date)}
        onChange={(e) => onDate(addDays(from, Number(e.target.value)))}
        aria-valuetext={date}
        data-testid="date-slider"
      />
      <div className="date-row">
        <span className="muted mono">{from.slice(0, 4)}</span>
        <label htmlFor={pickerId} className="sr-only">
          Exact date
        </label>
        <input
          id={pickerId}
          type="date"
          className="select"
          min={from}
          max={to}
          value={date}
          onChange={(e) => e.target.value && onDate(clampDate(e.target.value, from, to))}
          data-testid="date-input"
        />
        <button type="button" className="btn btn--sm" onClick={() => onDate(today)} disabled={date === today}>
          Today
        </button>
        <span className="muted mono">{to.slice(0, 4)}</span>
      </div>
    </div>
  );
}

export function PlayControls({
  playing,
  canPlay,
  measuring,
  speed,
  onSpeed,
  onToggle,
  zoomedTo,
  onZoomOut,
}: {
  playing: boolean;
  canPlay: boolean;
  measuring: boolean;
  speed: PlaySpeedId;
  onSpeed: (s: PlaySpeedId) => void;
  onToggle: () => void;
  zoomedTo: string | null;
  onZoomOut: () => void;
}) {
  return (
    <section className="solar-play" aria-label="Orbit play" data-testid="play-controls">
      <div className="solar-play-row">
        <button type="button" className="btn btn--primary" onClick={onToggle} disabled={!playing && !canPlay}
          data-testid="play-toggle">
          {playing ? "Pause" : "Play the orbits"}
        </button>
        {zoomedTo && (
          <button type="button" className="btn" onClick={onZoomOut} data-testid="zoom-out">
            Zoom out from {zoomedTo}
          </button>
        )}
        <Toggle legend="Speed (time a second)" options={PLAY_SPEEDS.map((x) => ({ value: x.id, label: x.short, title: x.label }))}
          value={speed} onChange={onSpeed} />
      </div>
      <p className="muted" data-testid="play-note">
        {measuring
          ? "Play is off while you measure, because a distance is for one date."
          : playing
            ? "Each planet follows its orbit path. Pause to load the exact positions for the date shown."
            : zoomedTo
              ? `Zoomed to ${zoomedTo}. Play to watch it travel round the Sun.`
              : "Play moves the date forward and the planets along their orbits."}
      </p>
    </section>
  );
}
