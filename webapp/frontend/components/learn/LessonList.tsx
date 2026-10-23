"use client";

import Link from "next/link";
import Badge from "@/components/ui/Badge";
import type { LessonSummary } from "@/lib/api-v2";
import { badges, status, type LessonStatus } from "@/lib/learn";
import { useProgress } from "./useProgress";

const STATUS: Record<LessonStatus, { text: string; tone: "clean" | "info" | "outline" }> = {
  "not-started": { text: "Not started", tone: "outline" },
  "in-progress": { text: "In progress", tone: "info" },
  complete: { text: "Badge earned", tone: "clean" },
};

/** Every lesson with this device's progress, and the badges earned so far. */
export default function LessonList({ lessons }: { lessons: LessonSummary[] }) {
  const { progress, ready, sync } = useProgress();
  const earned = badges(progress, lessons.map((l) => l.slug));
  const names = lessons.filter((l) => earned.includes(l.slug)).map((l) => l.badge.name);

  return (
    <>
      <section className="card learn-badges" aria-labelledby="badges-h" data-testid="learn-badges">
        <h2 id="badges-h" className="card-title">Your badges</h2>
        <p>
          {ready ? `${earned.length} of ${lessons.length}` : `0 of ${lessons.length}`}. Answer every question in a
          lesson's quiz correctly (retries are fine) to earn its badge.
        </p>
        {names.length > 0 && (
          <ul className="badge-list">
            {names.map((n) => <li key={n}><Badge tone="clean">{n}</Badge></li>)}
          </ul>
        )}
        <p className="muted small" data-testid="progress-where">
          {sync === "local"
            ? "Progress is kept on this device only. Nothing is sent to us."
            : "Progress is kept on this device and in your account, so it follows you to your other devices. It holds lesson names, question names, how many tries, and when a badge was earned, nothing else."}
        </p>
      </section>
      <ol className="lesson-list" data-testid="lesson-list">
        {lessons.map((l, i) => {
          const st = STATUS[ready ? status(progress, l.slug) : "not-started"];
          return (
            <li key={l.slug} className="card lesson-card">
              <p className="eyebrow">Lesson {i + 1} · {l.minutes} min · {l.steps} steps · {l.questions} questions</p>
              <h2 className="card-title"><Link href={`/learn/${l.slug}`}>{l.title}</Link></h2>
              <p>{l.summary}</p>
              <p><Badge tone={st.tone}>{st.text}</Badge></p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
