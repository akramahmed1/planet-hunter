"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton from "@/components/ui/Skeleton";
import { apiV2Send, type ClassDetail, type Gradebook, type LessonsResponse } from "@/lib/api-v2";
import { endOfDay, formatDue, gradeText, type AssignmentKind } from "@/lib/classroom";

const KIND_LABEL: Record<AssignmentKind, string> = { lesson: "Lesson and quiz", quiz: "Quiz only", hunt: "Hunt challenge" };

/** A teacher's view of one class: join code, students, assignments and the gradebook. */
export default function ClassPage({ id, candidates }: { id: number; candidates: { slug: string; target: string }[] }) {
  const [k, setK] = useState<ClassDetail | null>(null);
  const [g, setG] = useState<Gradebook | null>(null);
  const [lessons, setLessons] = useState<LessonsResponse["lessons"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const load = useCallback(async () => {
    const [kr, gr] = await Promise.all([
      apiV2Send<ClassDetail>("GET", `/api/v2/classes/${id}`),
      apiV2Send<Gradebook>("GET", `/api/v2/classes/${id}/gradebook`),
    ]);
    if (kr.ok) setK(kr.data);
    else setError(kr.status === 401 ? "Sign in as a teacher first." : kr.error);
    if (gr.ok) setG(gr.data);
  }, [id]);
  useEffect(() => {
    load();
    apiV2Send<LessonsResponse>("GET", "/api/v2/lessons").then((r) => r.ok && setLessons(r.data.lessons));
  }, [load]);

  async function act(method: "POST" | "PUT" | "DELETE", path: `/api/v2/${string}`, body: unknown, done: string) {
    const r = await apiV2Send(method, path, body);
    if (r.ok) {
      setNotice(done);
      setError(null);
      await load();
    } else {
      setError(r.error);
    }
    return r.ok;
  }

  if (deleted) {
    return <p className="callout" role="status">The class and everything stored about its students were deleted.{" "}
      <Link href="/classroom">Back to your classes</Link></p>;
  }
  if (error && !k) return <ErrorState title="This class could not be loaded." detail={error} />;
  if (!k) return <Skeleton height="10rem" />;

  return (
    <div data-testid="class-page">
      <h1>{k.name}</h1>
      <p className="lede">
        Students join at <strong>Classroom</strong> with code{" "}
        <code className="code-chip code-chip--big" data-testid="class-code-value">{k.join_code}</code>, a nickname
        and a PIN. No email.{" "}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() =>
          act("POST", `/api/v2/classes/${id}/join-code`, {}, "New join code made. The old one no longer works.")}>
          New code
        </button>
      </p>
      <div aria-live="polite">
        {notice && <p className="callout" role="status">{notice}</p>}
        {error && <p className="error-box" role="alert">{error}</p>}
      </div>

      <AssignForm lessons={lessons} candidates={candidates} onAssign={(kind, ref, due) =>
        act("POST", `/api/v2/classes/${id}/assignments`, { kind, ref, due_at: due }, "Assigned.")} />

      <section className="card" aria-labelledby="gb-h">
        <h2 id="gb-h" className="card-title">Gradebook</h2>
        {g && g.assignments.length > 0 && g.rows.length > 0 ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Gradebook (scrolls sideways)">
            <table className="gradebook" data-testid="gradebook">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {g.assignments.map((a) => <th scope="col" key={a.id}>{a.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.member_id}>
                    <th scope="row">{r.nickname}</th>
                    {r.cells.map((c, i) => <td key={g.assignments[i].id}>{gradeText(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Grades appear here once students start their assignments.</p>}
        <p className="muted small">Lesson and quiz scores count questions answered right on the first try. Hunt
          challenges score the best try out of 100.</p>
        <p className="btn-row">
          <a className="btn btn--sm" href={`/api/v2/classes/${id}/gradebook.csv`} download data-testid="csv-link">
            Download CSV
          </a>
          <a className="btn btn--sm btn--ghost" href={`/api/v2/classes/${id}/export`} download>Export all class data</a>
        </p>
      </section>

      <section className="card" aria-labelledby="as-h">
        <h2 id="as-h" className="card-title">Assignments</h2>
        {k.assignments.length === 0 ? <p className="muted">None yet.</p> : (
          <ul className="assignment-list">
            {k.assignments.map((a) => (
              <li key={a.id}>
                {a.title} <span className="muted small">· {KIND_LABEL[a.kind]}{a.due_at ? ` · due ${formatDue(a.due_at)}` : ""}</span>{" "}
                <button type="button" className="btn btn--sm btn--ghost" aria-label={`Remove ${a.title}`}
                  onClick={() => window.confirm(`Remove "${a.title}" and its grades?`) &&
                    act("DELETE", `/api/v2/assignments/${a.id}`, undefined, "Assignment removed.")}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="st-h">
        <h2 id="st-h" className="card-title">Students</h2>
        {k.students.length === 0 ? <p className="muted">Nobody has joined yet.</p> : (
          <ul className="student-list" data-testid="student-list">
            {k.students.map((st) => (
              <li key={st.id}>
                <span className="student-name">{st.nickname}</span>
                <button type="button" className="btn btn--sm" onClick={() => {
                  const pin = window.prompt(`New PIN for ${st.nickname} (4 to 8 digits):`);
                  if (pin) act("PUT", `/api/v2/classes/${id}/students/${st.id}/pin`, { pin },
                    `PIN reset for ${st.nickname}. Tell them the new PIN.`);
                }}>Reset PIN</button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() =>
                  window.confirm(`Remove ${st.nickname} and their results from this class?`) &&
                  act("DELETE", `/api/v2/classes/${id}/students/${st.id}`, undefined, `${st.nickname} was removed.`)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card--flat" aria-labelledby="del-h">
        <h2 id="del-h" className="card-title">Delete this class</h2>
        <p className="muted">Deletes the class, every student's nickname and PIN, and all results. This cannot be
          undone. Export the data first if you need it.</p>
        <button type="button" className="btn btn--sm" data-testid="delete-class" onClick={async () => {
          const typed = window.prompt(`Type the class name (${k.name}) to delete it:`);
          if (typed !== k.name) return;
          const r = await apiV2Send("DELETE", `/api/v2/classes/${id}`);
          if (r.ok) setDeleted(true);
          else setError(r.error);
        }}>Delete class</button>
      </section>
    </div>
  );
}

function AssignForm({ lessons, candidates, onAssign }: {
  lessons: LessonsResponse["lessons"];
  candidates: { slug: string; target: string }[];
  onAssign: (kind: AssignmentKind, ref: string, due: string | null) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<AssignmentKind>("lesson");
  const [ref, setRef] = useState("");
  const [due, setDue] = useState("");
  const options = kind === "hunt" ? candidates.map((c) => ({ value: c.slug, label: c.target }))
    : lessons.map((l) => ({ value: l.slug, label: l.title }));
  return (
    <form className="card form-card" aria-labelledby="assign-h" data-testid="assign-form" onSubmit={async (e) => {
      e.preventDefault();
      if (await onAssign(kind, ref, due ? endOfDay(due) : null)) setRef("");
    }}>
      <h2 id="assign-h" className="card-title">Assign something</h2>
      <div className="field">
        <label htmlFor="assign-kind" className="field-label">Type</label>
        <select id="assign-kind" className="select" value={kind} onChange={(e) => {
          setKind(e.target.value as AssignmentKind);
          setRef("");
        }} data-testid="assign-kind">
          {(Object.keys(KIND_LABEL) as AssignmentKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="assign-ref" className="field-label">{kind === "hunt" ? "Star" : "Lesson"}</label>
        <select id="assign-ref" className="select" value={ref} onChange={(e) => setRef(e.target.value)} required
          data-testid="assign-ref">
          <option value="">Choose...</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="assign-due" className="field-label">Due (optional)</label>
        <input id="assign-due" type="date" className="select" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <button type="submit" className="btn btn--primary" data-testid="assign-submit">Assign</button>
    </form>
  );
}
