"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton from "@/components/ui/Skeleton";
import { apiV2Send, type ClassSummary, type Me, type OrgBilling, type OrgDetail, type StudentHome } from "@/lib/api-v2";
import { assignmentHref, formatDue } from "@/lib/classroom";
import SignIn from "./SignIn";

/** /classroom: sign in, then the teacher's classes or the student's assignments. */
export default function ClassroomHome() {
  const [me, setMe] = useState<Me["me"] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await apiV2Send<Me>("GET", "/api/v2/auth/me");
    if (r.ok) {
      setMe(r.data.me);
      setError(null);
    } else {
      setError(r.error);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await apiV2Send("POST", "/api/v2/auth/logout", {});
    setMe(null);
  }

  if (error) return <ErrorState title="Classroom could not be loaded." detail={error} />;
  if (me === undefined) return <Skeleton height="8rem" />;
  if (me === null) return <SignIn onSignedIn={load} />;
  return (
    <>
      <p className="signed-in muted" data-testid="signed-in">
        Signed in as <strong>{me.kind === "teacher" ? me.display_name : me.nickname}</strong>.{" "}
        <button type="button" className="btn btn--sm btn--ghost" onClick={logout} data-testid="logout">Sign out</button>
      </p>
      {me.kind === "teacher" ? <TeacherHome orgs={me.orgs} onChange={load} /> : <StudentAssignments />}
    </>
  );
}

function TeacherHome({ orgs, onChange }: { orgs: { org_id: number; name: string; role: string }[];
  onChange: () => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div data-testid="teacher-home">
      {orgs.map((o) => <OrgPanel key={o.org_id} orgId={o.org_id} />)}
      <details className="card">
        <summary>Join or start another school or group</summary>
        <form className="inline-form" onSubmit={async (e) => {
          e.preventDefault();
          const r = await apiV2Send("POST", "/api/v2/orgs/join", { code: joinCode });
          if (r.ok) onChange();
          else setError(r.error);
        }}>
          <label htmlFor="join-org" className="field-label">Join code</label>
          <input id="join-org" className="select" value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
            required maxLength={20} />
          <button type="submit" className="btn btn--sm">Join</button>
        </form>
        <form className="inline-form" onSubmit={async (e) => {
          e.preventDefault();
          const r = await apiV2Send("POST", "/api/v2/orgs", { name: newOrg });
          if (r.ok) onChange();
          else setError(r.error);
        }}>
          <label htmlFor="new-org" className="field-label">New school or group</label>
          <input id="new-org" className="select" value={newOrg} onChange={(e) => setNewOrg(e.target.value)} required
            minLength={2} maxLength={120} />
          <button type="submit" className="btn btn--sm">Create</button>
        </form>
        {error && <p className="error-box" role="alert">{error}</p>}
      </details>
    </div>
  );
}

function OrgPanel({ orgId }: { orgId: number }) {
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [o, c] = await Promise.all([
      apiV2Send<OrgDetail>("GET", `/api/v2/orgs/${orgId}`),
      apiV2Send<{ classes: ClassSummary[] }>("GET", `/api/v2/orgs/${orgId}/classes`),
    ]);
    if (o.ok) setOrg(o.data);
    if (c.ok) setClasses(c.data.classes);
    if (!o.ok || !c.ok) setError((!o.ok && o.error) || (!c.ok && c.error) || null);
  }, [orgId]);
  useEffect(() => {
    load();
  }, [load]);

  if (error && !org) return <ErrorState title="This school could not be loaded." detail={error} />;
  if (!org || !classes) return <Skeleton height="6rem" />;
  return (
    <section className="card" aria-labelledby={`org-${orgId}`} data-testid="org-panel">
      <p className="eyebrow">{org.role === "org_admin" ? "You are an admin" : "Teacher"}</p>
      <h2 id={`org-${orgId}`} className="card-title">{org.name}</h2>
      {org.join_code && (
        <p className="muted small">
          Other teachers join with code <code className="code-chip" data-testid="org-code-value">{org.join_code}</code>.
        </p>
      )}
      <h3 className="sub-h">Classes</h3>
      {classes.length === 0 ? <p className="muted">No classes yet.</p> : (
        <ul className="class-list">
          {classes.map((k) => (
            <li key={k.id}>
              <Link href={`/classroom/class/${k.id}`} data-testid="class-link">{k.name}</Link>{" "}
              <span className="muted small">{k.students} {k.students === 1 ? "student" : "students"} · code{" "}
                <code className="code-chip">{k.join_code}</code></span>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={async (e) => {
        e.preventDefault();
        const r = await apiV2Send("POST", `/api/v2/orgs/${orgId}/classes`, { name });
        if (r.ok) {
          setName("");
          load();
        } else {
          setError(r.error);
        }
      }}>
        <label htmlFor={`new-class-${orgId}`} className="field-label">New class</label>
        <input id={`new-class-${orgId}`} className="select" value={name} onChange={(e) => setName(e.target.value)}
          required maxLength={80} placeholder="For example: Period 3 Physics" data-testid="new-class-name" />
        <button type="submit" className="btn btn--sm btn--primary" data-testid="create-class">Create class</button>
      </form>
      {error && <p className="error-box" role="alert">{error}</p>}
      {org.role === "org_admin" && <PlanLine orgId={orgId} />}
      <details>
        <summary>Teachers in {org.name}</summary>
        <ul>
          {org.teachers.map((t) => (
            <li key={t.user_id}>{t.display_name} <Badge tone="outline">{t.role === "org_admin" ? "admin" : "teacher"}</Badge></li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function StudentAssignments() {
  const [home, setHome] = useState<StudentHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiV2Send<StudentHome>("GET", "/api/v2/me/assignments").then((r) => (r.ok ? setHome(r.data) : setError(r.error)));
  }, []);
  if (error) return <ErrorState title="Your assignments could not be loaded." detail={error} />;
  if (!home) return <Skeleton height="6rem" />;
  return (
    <section className="card" aria-labelledby="my-h" data-testid="student-home">
      <p className="eyebrow">{home.class.name}</p>
      <h2 id="my-h" className="card-title">Your assignments</h2>
      {home.assignments.length === 0 ? <p className="muted">Nothing assigned yet.</p> : (
        <ul className="assignment-list">
          {home.assignments.map((a) => (
            <li key={a.id} data-testid="my-assignment">
              <Link href={assignmentHref(a)}>{a.title}</Link>
              <span className="muted small">{a.due_at ? ` · due ${formatDue(a.due_at)}` : ""}</span>{" "}
              {a.result ? (
                <Badge tone={a.result.completed_at ? "clean" : "info"}>
                  {a.result.completed_at ? "Done" : "Started"}: {a.result.score} of {a.result.max_score}
                </Badge>
              ) : <Badge tone="outline">Not started</Badge>}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Quiz scores count the questions you got right on the first try.</p>
    </section>
  );
}

/** The organization's plan. Upgrading appears only when billing is switched on (Phase 9). */
function PlanLine({ orgId }: { orgId: number }) {
  const [b, setB] = useState<OrgBilling | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiV2Send<OrgBilling>("GET", `/api/v2/orgs/${orgId}/billing`).then((r) => r.ok && setB(r.data));
  }, [orgId]);
  if (!b) return null;
  return (
    <p className="muted small" data-testid="plan-line">
      Plan: {b.plan === "classroom" ? "Classroom plan" : "Free classroom"}.{" "}
      {b.billing_enabled && b.plan !== "classroom" && (
        <button type="button" className="btn btn--sm" onClick={async () => {
          const r = await apiV2Send<{ url: string }>("POST", `/api/v2/orgs/${orgId}/billing/checkout`, {});
          if (r.ok) window.location.assign(r.data.url);
          else setError(r.error);
        }}>Upgrade</button>
      )}
      {error && <span className="error-box" role="alert">{error}</span>}
    </p>
  );
}
