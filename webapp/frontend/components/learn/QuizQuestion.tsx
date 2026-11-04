"use client";

import { useId, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import { apiV2Post, type AnswerResult, type LessonQuestion } from "@/lib/api-v2";
import { parseNumber, toleranceText } from "@/lib/learn";

/**
 * One quiz question. The answer is checked by the API, so the right answer is never in
 * the page until it has been answered. Every answer shows an explanation; wrong answers
 * can be retried.
 */
export default function QuizQuestion({
  slug,
  index,
  question,
  alreadyRight,
  onAnswered,
}: {
  slug: string;
  index: number;
  question: LessonQuestion;
  alreadyRight: boolean;
  onAnswered: (correct: boolean) => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const promptId = `${id}-prompt`;
  const hintId = `${id}-hint`;
  const numeric = question.kind === "numeric";
  const value = numeric ? parseNumber(typed) : null;
  const canCheck = !busy && !result && (numeric ? value !== null : choice !== null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!canCheck) return;
    setBusy(true);
    setError(null);
    const r = await apiV2Post<AnswerResult>(`/api/v2/lessons/${slug}/answers`,
      numeric ? { question: question.key, value } : { question: question.key, choice });
    setBusy(false);
    if (!r.ok) {
      setError(`Your answer could not be checked (${r.error}). Try again in a moment.`);
      return;
    }
    setResult(r.data);
    onAnswered(r.data.correct);
  }

  function retry() {
    setResult(null);
    setChoice(null);
    setTyped("");
  }

  const answerText = result
    ? result.correct_choice !== null && question.choices
      ? question.choices[result.correct_choice]
      : result.answer !== null
        ? `${result.answer} ${result.unit ?? ""}`.trim()
        : null
    : null;

  return (
    <form className="card quiz-q" onSubmit={check} data-testid={`quiz-${question.key}`}>
      <fieldset disabled={busy || result !== null}>
        <legend id={promptId} className="quiz-prompt">
          <span className="quiz-num">Question {index + 1}</span> {question.prompt}
        </legend>
        {numeric ? (
          <div className="quiz-numeric">
            <label htmlFor={`${id}-n`} className="sr-only">Your answer in {question.unit}</label>
            <input id={`${id}-n`} className="select quiz-input" inputMode="decimal" autoComplete="off"
              value={typed} onChange={(e) => setTyped(e.target.value)} aria-describedby={hintId}
              data-testid={`quiz-${question.key}-input`} />
            <span className="quiz-unit" aria-hidden="true">{question.unit}</span>
            <p id={hintId} className="muted small">
              {question.tolerance !== null && question.unit ? toleranceText(question.tolerance, question.unit) : null}
              {typed.trim() && value === null ? " That is not a number yet." : null}
            </p>
          </div>
        ) : (
          <div className="quiz-choices" role="radiogroup" aria-labelledby={promptId}>
            {question.choices?.map((c, i) => (
              <label key={c} className={`quiz-choice${choice === i ? " is-picked" : ""}`}>
                <input type="radio" name={`${id}-c`} value={i} checked={choice === i} onChange={() => setChoice(i)}
                  data-testid={`quiz-${question.key}-choice-${i}`} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {!result && (
        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={!canCheck}
            data-testid={`quiz-${question.key}-check`}>
            {busy ? "Checking..." : "Check answer"}
          </button>
          {alreadyRight && <span className="muted small">You got this one right before.</span>}
        </div>
      )}
      {error && <p className="error-box" role="alert">{error}</p>}
      <div role="status" aria-live="polite">
        {result && (
          <div className={`quiz-result ${result.correct ? "quiz-result--right" : "quiz-result--wrong"}`}
            data-testid={`quiz-${question.key}-result`}>
            <p className="quiz-verdict">{result.correct ? "Right." : "Not quite."}</p>
            {result.choice_explanation && <p>{result.choice_explanation}</p>}
            {!result.correct && answerText && (
              <p>
                The answer is <strong>{answerText}</strong>
                {result.tolerance !== null && result.unit ? ` (give or take ${result.tolerance} ${result.unit})` : ""}.
              </p>
            )}
            <p>
              <SourceButton label={`Question ${index + 1}`} source={result.source} kind="reference">
                {result.explanation}
              </SourceButton>
            </p>
            {!result.correct && (
              <button type="button" className="btn btn--sm" onClick={retry} data-testid={`quiz-${question.key}-retry`}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
