"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton from "@/components/ui/Skeleton";
import { apiV2Post, apiV2Send, type Schemas } from "@/lib/api-v2";
import { count } from "@/lib/plural";

type Overview = Schemas["OrgOverview"];

/** The school at a glance for its admins: totals, every teacher with their role, every class with its teacher. */
export default function SchoolAdmin({ id }: { id: number }) {
  const [o, setO] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<{ status: number | null; text: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await apiV2Send<Overview>("GET", `/api/v2/orgs/${id}/overview`);
    if (r.ok) setO(r.data);
    else setProblem({ status: r.status, text: r.error });
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (problem) {
    if (problem.status === 403) return <p role="alert" data-testid="school-forbidden">Only a school admin can see this page.</p>;
    if (problem.status === 404 || problem.status === 401) {
      return <p role="alert" data-testid="school-missing">We could not find that school. <Link href="/classroom">Back to your classes</Link>.</p>;
    }
    return <ErrorState title="The school overview could not be loaded." detail={problem.text} />;
  }
  if (!o) return <Skeleton height="10rem" />;
  const t = o.totals;
  return (
    <section aria-labelledby="school-h" data-testid="school-admin">
      <p className="eyebrow">School admin</p>
      <h1 id="school-h">{o.name}</h1>
      <dl className="glance" data-testid="school-totals">
        <div><dt>Teachers</dt><dd data-testid="tot-teachers">{t.teachers}</dd></div>
        <div><dt>Classes</dt><dd data-testid="tot-classes">{t.classes}</dd></div>
        <div><dt>Students</dt><dd data-testid="tot-students">{t.students}</dd></div>
        <div><dt>Assignments</dt><dd data-testid="tot-assignments">{t.assignments}</dd></div>
      </dl>
      {t.unassigned_classes > 0 && (
        <p className="callout" role="note" data-testid="unassigned-note">
          {count(t.unassigned_classes, "class", "classes")} no longer {t.unassigned_classes === 1 ? "has" : "have"} the teacher who made{" "}
          {t.unassigned_classes === 1 ? "it" : "them"}. They keep working; any teacher in the school can open them.
        </p>
      )}

      <h2 className="sub-h">Teachers</h2>
      <ul className="class-list" data-testid="teacher-list">
        {o.teachers.map((tc) => (
          <li key={tc.user_id} data-testid="teacher-row">
            <strong>{tc.display_name}</strong>{" "}
            <label className="sr-only" htmlFor={`role-${tc.user_id}`}>Role for {tc.display_name}</label>
            <select id={`role-${tc.user_id}`} className="select select--sm" value={tc.role} data-testid="role-select"
              onChange={async (e) => {
                setNotice(null);
                const r = await apiV2Send("PUT", `/api/v2/orgs/${id}/teachers/${tc.user_id}/role`, { role: e.target.value });
                if (!r.ok) setNotice(r.error);
                await load();
              }}>
              <option value="org_admin">Admin</option>
              <option value="teacher">Teacher</option>
            </select>{" "}
            <span className="muted small"><span className="nowrap">{count(tc.classes, "class", "classes")}</span> · <span className="nowrap">{count(tc.students, "student")}</span></span>
          </li>
        ))}
      </ul>
      {notice && <p className="error-box" role="alert" data-testid="role-error">{notice}</p>}
      <p className="muted small">Admins can see this page, change roles and make a new join code. Every school needs at least one admin.</p>

      <h2 className="sub-h">Classes</h2>
      {o.classes.length === 0 ? <p className="muted">No classes yet.</p> : (
        <ul className="class-list" data-testid="class-list">
          {o.classes.map((k) => (
            <li key={k.id} data-testid="class-row">
              <Link href={`/classroom/class/${k.id}`}>{k.name}</Link>{" "}
              <span className="muted small">{k.teacher ?? "no teacher"} · <span className="nowrap">{count(k.students, "student")}</span> · <span className="nowrap">{count(k.assignments, "assignment")}</span></span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="sub-h">Join code for new teachers</h2>
      <p className="muted small">
        A new code stops the old one working at once. Teachers already in the school are not affected.
      </p>
      {code && <p>New code: <code className="code-chip" data-testid="new-code">{code}</code></p>}
      <p>
        <button type="button" className="btn btn--sm" data-testid="new-code-button" onClick={async () => {
          const r = await apiV2Post<{ join_code: string }>(`/api/v2/orgs/${id}/join-code`, {});
          if (r.ok) setCode(r.data.join_code);
          else setNotice(r.error);
        }}>Make a new join code</button>
      </p>
    </section>
  );
}
