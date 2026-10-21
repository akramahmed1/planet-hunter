"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SourceButton from "@/components/live/SourceButton";
import type { LessonResponse } from "@/lib/api-v2";
import { correctCount, hasBadge, markStep, recordAnswer } from "@/lib/learn";
import QuizQuestion from "./QuizQuestion";
import { useProgress } from "./useProgress";
import { count } from "@/lib/plural";

/** A lesson: its steps one at a time with Back and Next, then the quiz and the badge. */
export default function LessonPlayer({ lesson, startAtQuiz = false }: { lesson: LessonResponse; startAtQuiz?: boolean }) {
  const { progress, update, ready, saved } = useProgress();
  const [index, setIndex] = useState(startAtQuiz ? lesson.steps.length : 0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const total = lesson.steps.length;
  const onQuiz = index === total;
  const keys = lesson.questions.map((q) => q.key);
  const right = correctCount(progress, lesson.slug, keys);
  const earned = hasBadge(progress, lesson.slug);

  useEffect(() => {
    if (!onQuiz) update((p) => markStep(p, lesson.slug, index));
    // Move focus to the new heading after Back or Next (not on first load).
    if (moved.current) headingRef.current?.focus();
  }, [index, onQuiz, lesson.slug, update]);

  function go(to: number) {
    moved.current = true;
    setIndex(Math.max(0, Math.min(total, to)));
  }

  const step = lesson.steps[index];

  return (
    <div className="lesson" data-testid="lesson">
      <ol className="step-dots" aria-label="Lesson progress">
        {[...lesson.steps.map((s) => s.heading), "Quiz"].map((label, i) => (
          <li key={`${i}-${label}`}>
            <button type="button" className="step-dot" aria-current={i === index ? "step" : undefined}
              onClick={() => go(i)} aria-label={i === total ? "Quiz" : `Step ${i + 1}: ${label}`}>
              {i === total ? "Quiz" : i + 1}
            </button>
          </li>
        ))}
      </ol>

      {!onQuiz ? (
        <section className="card lesson-step" aria-labelledby="step-h" data-testid="lesson-step">
          <p className="eyebrow">Step {index + 1} of {total}</p>
          <h2 id="step-h" ref={headingRef} tabIndex={-1}>{step.heading}</h2>
          {step.body.map((p) => <p key={p}>{p}</p>)}
          <h3 className="lesson-facts-h">Where this comes from</h3>
          <ul className="lesson-facts">
            {step.facts.map((f, i) => (
              <li key={f.text}>
                <SourceButton label={`Fact ${i + 1}`} source={f.source} kind={f.kind}>{f.text}</SourceButton>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-labelledby="quiz-h" className="lesson-quiz" data-testid="lesson-quiz">
          <h2 id="quiz-h" ref={headingRef} tabIndex={-1}>Quiz</h2>
          <p className="muted" data-testid="quiz-score" aria-live="polite">
            {ready ? `${right} of ${keys.length} answered right so far.` : `${count(keys.length, "question")}.`} You can try
            again as many times as you like.
          </p>
          {lesson.questions.map((q, i) => (
            <QuizQuestion key={q.key} slug={lesson.slug} index={i} question={q}
              alreadyRight={Boolean(progress.lessons[lesson.slug]?.questions[q.key]?.correct)}
              onAnswered={(ok) => update((p) => recordAnswer(p, lesson.slug, q.key, ok, keys))} />
          ))}
          {earned && (
            <div className="card card--glow badge-earned" role="status" data-testid="badge-earned">
              <p className="eyebrow">Badge earned</p>
              <h3>{lesson.badge.name}</h3>
              <p>{lesson.badge.text}</p>
            </div>
          )}
          <section className="card" aria-labelledby="try-h">
            <h3 id="try-h" className="card-title">Try it on the site</h3>
            <ul className="lesson-links">
              {lesson.links.map((l) => <li key={l.href + l.label}><Link href={l.href}>{l.label}</Link></li>)}
            </ul>
          </section>
        </section>
      )}

      {!saved && (
        <p className="callout" role="note">
          Your progress cannot be saved on this device (storage is blocked), so it will reset when you leave.
        </p>
      )}

      <div className="btn-row lesson-nav">
        <button type="button" className="btn" onClick={() => go(index - 1)} disabled={index === 0}
          data-testid="lesson-back">
          Back
        </button>
        {!onQuiz ? (
          <button type="button" className="btn btn--primary" onClick={() => go(index + 1)} data-testid="lesson-next">
            {index === total - 1 ? "Take the quiz" : "Next"}
          </button>
        ) : (
          <Link href="/learn" className="btn">All lessons</Link>
        )}
      </div>
    </div>
  );
}
