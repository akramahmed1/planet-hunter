"use client";

import { useEffect, useId, useState } from "react";
import { apiV2Get, apiV2Post, type ExplainResponse, type ExplainStatus } from "@/lib/api-v2";

type Kind = "candidate" | "scan" | "planet";
const MAX = 300;

/**
 * "What am I looking at?": ask one question about this page. The answer comes only from this
 * page's data and the lessons, with the fields it used. Hidden when the explainer is switched off.
 */
export default function ExplainBox({ kind, refId }: { kind: Kind; refId: string }) {
  const [status, setStatus] = useState<ExplainStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    apiV2Get<ExplainStatus>("/api/v2/explain/status").then((r) => r.ok && setStatus(r.data));
  }, []);

  if (status?.paused) {
    // On, but this month's budget is used up: say so quietly instead of vanishing.
    return (
      <section className="card explain" aria-labelledby={`${id}-h`} data-testid="explain-paused">
        <h2 id={`${id}-h`} className="card-title">What am I looking at?</h2>
        <p className="muted">The explainer is paused until next month to keep its running cost in check. Everything else on this page works.</p>
      </section>
    );
  }
  if (!status?.enabled) return null;
  return (
    <section className="card explain" aria-labelledby={`${id}-h`} data-testid="explain">
      <h2 id={`${id}-h`} className="card-title">What am I looking at?</h2>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await apiV2Post<ExplainResponse>("/api/v2/explain", { kind, ref: refId, question });
        setBusy(false);
        if (r.ok) setAnswer(r.data);
        else setError(r.error);
      }}>
        <label htmlFor={`${id}-q`} className="field-label">Ask a question about this page</label>
        <textarea id={`${id}-q`} className="select explain-input" rows={2} maxLength={MAX} value={question}
          onChange={(e) => setQuestion(e.target.value)} placeholder="For example: why is this not called a planet?"
          data-testid="explain-question" />
        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={busy || !question.trim()} data-testid="explain-ask">
            {busy ? "Thinking..." : "Ask"}
          </button>
          <span className="muted small">{question.length}/{MAX}</span>
        </div>
      </form>
      <div role="status" aria-live="polite">
        {answer && (
          <div className="quiz-result" data-testid="explain-answer">
            <p>{answer.answer}</p>
            {answer.citations.length > 0 && (
              <>
                <p className="muted small">From these fields:</p>
                <ul className="explain-cites">
                  {answer.citations.map((c) => (
                    <li key={c.path}><code>{c.path}</code>: {String(c.value)}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="muted small">{answer.note}</p>
          </div>
        )}
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
    </section>
  );
}
