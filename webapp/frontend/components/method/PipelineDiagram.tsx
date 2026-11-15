"use client";

import { useId, useState, type KeyboardEvent } from "react";

type Step = { title: string; body: string };

/**
 * The pipeline as a row of numbered stages (a column on a phone). Choosing a stage shows its description underneath.
 * It draws from the same steps as the written list below it, so the two can never disagree, and the written list is
 * always on the page for anyone who prefers text or cannot use the diagram.
 */
export default function PipelineDiagram({ steps }: { steps: Step[] }) {
  const [at, setAt] = useState(0);
  const id = useId();
  const go = (i: number) => {
    const next = (i + steps.length) % steps.length;
    setAt(next);
    document.getElementById(`${id}-stage-${next}`)?.focus();
  };
  const key = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(steps.length - 1); }
  };
  const step = steps[at];
  return (
    <div className="pipeline" data-testid="pipeline">
      <p className="muted">Choose a stage to read what it does. The same steps are written out in full below.</p>
      <div role="tablist" aria-label="Pipeline stages" aria-orientation="horizontal" className="pipeline-stages">
        {steps.map((s, i) => (
          <button
            key={s.title}
            id={`${id}-stage-${i}`}
            type="button"
            role="tab"
            aria-selected={i === at}
            aria-controls={`${id}-panel`}
            tabIndex={i === at ? 0 : -1}
            className="pipeline-stage"
            data-testid={`stage-${i}`}
            onClick={() => setAt(i)}
            onKeyDown={(e) => key(e, i)}
          >
            <span className="pipeline-num" aria-hidden="true">{i + 1}</span>
            <span className="pipeline-name">{s.title}</span>
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-stage-${at}`} className="pipeline-panel" data-testid="stage-panel">
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <p className="muted">
          Stage {at + 1} of {steps.length}
        </p>
      </div>
    </div>
  );
}
