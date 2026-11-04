"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton from "@/components/ui/Skeleton";
import { apiV2Post, apiV2Send, type ClassSummary, type Me, type OrgBilling, type OrgDetail, type StudentHome } from "@/lib/api-v2";
import { assignmentHref, formatDue, glanceParts, planStatus, schoolTotals, studentPlan } from "@/lib/classroom";
import { announceRole } from "@/lib/role";
import SignIn from "./SignIn";

/** /classroom: sign in, then the teacher's classes or the student's assignments. */
export default function ClassroomHome({ who }: { who?: "teacher" | "student" }) {
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
  // Keep the navigation's words in step with who is signed in (sign in, sign out, account deleted).
  useEffect(() => {
    if (me !== undefined) announceRole(me === null ? null : me.kind);
  }, [me]);

  async function logout() {
    await apiV2Send("POST", "/api/v2/auth/logout", {});
    setMe(null);
  }

  if (error) return <ErrorState title="Classroom could not be loaded." detail={error} />;
  if (me === undefined) return <Skeleton height="8rem" />;
  if (me === null) return <SignIn onSignedIn={load} initialWho={who} />;
  return (
    <>
      <p className="signed-in muted" data-testid="signed-in">
        Signed in as <strong>{me.kind === "teacher" ? me.display_name : me.nickname}</strong>.{" "}
        <button type="button" className="btn btn--sm btn--ghost" onClick={logout} data-testid="logout">Sign out</button>
      </p>
      {me.kind === "teacher" && !me.email_verified && <VerifyBanner email={me.email} />}
      {me.kind === "teacher" ? <TeacherHome orgs={me.orgs} onChange={load} /> : <StudentAssignments />}
      {me.kind === "teacher" && <TwoFactor on={me.two_factor} onChange={load} />}
      {me.kind === "teacher" && <DeleteAccount twoFactor={me.two_factor} onDeleted={() => setMe(null)} />}
    </>
  );
}

/** Optional two-step sign-in: set up with an authenticator app, save recovery codes, turn off or renew codes. */
function TwoFactor({ on, onChange }: { on: boolean; onChange: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function call<T>(path: `/api/v2/${string}`, body: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    const r = await apiV2Post<T>(path, body);
    setBusy(false);
    if (r.ok) return r.data;
    setError(r.error);
    return null;
  }

  return (
    <details className="card" data-testid="two-factor">
      <summary>Two-step sign-in {on ? "(on)" : "(off)"}</summary>
      {codes ? (
        <div data-testid="recovery-codes">
          <p>Save these recovery codes somewhere safe, such as a password manager. Each works once if you lose your
            phone. We cannot show them again.</p>
          <ul className="recovery-list">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          <label className="check-row">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)}
              data-testid="codes-saved" />{" "}I have saved my recovery codes
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" disabled={!saved}
              onClick={() => { setCodes(null); setSetup(null); setSaved(false); setCode(""); onChange(); }}
              data-testid="codes-done">Done</button>
          </div>
        </div>
      ) : !on && !setup ? (
        <div>
          <p className="muted small">Adds a six digit code from an authenticator app to your password. Recommended
            for anyone who sees student names.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" disabled={busy} data-testid="two-factor-start"
              onClick={async () => setSetup(await call("/api/v2/auth/teacher/2fa/setup", {}))}>Set it up</button>
          </div>
        </div>
      ) : !on && setup ? (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const r = await call<{ recovery_codes: string[] }>("/api/v2/auth/teacher/2fa/enable", { code });
          if (r) setCodes(r.recovery_codes);
        }}>
          <p>1. In an authenticator app (Google Authenticator, 1Password, Authy or similar), add an account with this
            key:</p>
          <p><code data-testid="two-factor-secret">{setup.secret}</code></p>
          <p className="small"><a href={setup.otpauth_uri}>Open it in an authenticator app on this device</a></p>
          <div className="field">
            <label htmlFor="tf-code" className="field-label">2. Type the six digit code the app shows</label>
            <input id="tf-code" className="select" value={code} onChange={(e) => setCode(e.target.value)} required
              inputMode="numeric" autoComplete="one-time-code" maxLength={12} data-testid="two-factor-code" />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn--primary" disabled={busy} data-testid="two-factor-enable">
              {busy ? "One moment..." : "Turn on"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => e.preventDefault()}>
          <p className="muted small">Two-step sign-in is on. To change it, type your password and a current code (or a
            recovery code).</p>
          <div className="field">
            <label htmlFor="tf-pw" className="field-label">Password</label>
            <input id="tf-pw" className="select" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={200}
              data-testid="two-factor-password" />
          </div>
          <div className="field">
            <label htmlFor="tf-code2" className="field-label">Code</label>
            <input id="tf-code2" className="select" value={code} onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code" maxLength={32} data-testid="two-factor-code" />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--ghost" disabled={busy || !password || !code}
              data-testid="two-factor-new-codes" onClick={async () => {
                const r = await call<{ recovery_codes: string[] }>("/api/v2/auth/teacher/2fa/recovery-codes",
                  { password, code });
                if (r) { setCodes(r.recovery_codes); setPassword(""); setCode(""); }
              }}>Get new recovery codes</button>
            <button type="button" className="btn btn--ghost" disabled={busy || !password || !code}
              data-testid="two-factor-off" onClick={async () => {
                if (await call("/api/v2/auth/teacher/2fa/disable", { password, code })) {
                  setPassword(""); setCode(""); onChange();
                }
              }}>Turn off</button>
          </div>
        </form>
      )}
      {error && <p className="error-box" role="alert" data-testid="two-factor-error">{error}</p>}
    </details>
  );
}

/** Delete the teacher's account. If they are the only teacher of a school, the answer asks them to confirm that the
 * school and its students go too. */
function DeleteAccount({ onDeleted, twoFactor }: { onDeleted: () => void; twoFactor: boolean }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [alsoSchool, setAlsoSchool] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  return (
    <details className="card" data-testid="delete-account">
      <summary>Delete my account</summary>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await apiV2Post<{ ok: boolean }>("/api/v2/auth/teacher/delete-account",
          { password, delete_school: alsoSchool, ...(twoFactor ? { code } : {}) });
        setBusy(false);
        if (r.ok) return onDeleted();
        setNeedsConfirm(r.status === 409 && r.error.includes("Confirm to continue"));
        setError(r.error);
      }}>
        <p className="muted small">This removes your account for good. Type your password to confirm.</p>
        <div className="field">
          <label htmlFor="delete-password" className="field-label">Password</label>
          <input id="delete-password" className="select" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} required maxLength={200} autoComplete="current-password"
            data-testid="delete-password" />
        </div>
        {error && <p className="error-box" role="alert" data-testid="delete-error">{error}</p>}
        {twoFactor && (
          <div className="field">
            <label htmlFor="delete-code" className="field-label">Code from your authenticator app</label>
            <input id="delete-code" className="select" value={code} onChange={(e) => setCode(e.target.value)} required
              maxLength={32} autoComplete="one-time-code" spellCheck={false} data-testid="delete-code" />
          </div>
        )}
        {needsConfirm && (
          <label className="check-row">
            <input type="checkbox" checked={alsoSchool} onChange={(e) => setAlsoSchool(e.target.checked)}
              data-testid="delete-school" />{" "}
            Yes, also delete the school or group with all its classes, students and results
          </label>
        )}
        <div className="btn-row">
          <button type="submit" className="btn btn--ghost" disabled={busy || (needsConfirm && !alsoSchool)}
            data-testid="delete-submit">{busy ? "One moment..." : "Delete my account"}</button>
        </div>
      </form>
    </details>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | string>("idle");
  return (
    <div className="callout" role="status" data-testid="verify-banner">
      <p>
        Please confirm your email address. We sent a link to <strong>{email}</strong>.{" "}
        {state === "sent" ? (
          <span data-testid="verify-resent">Sent again. Check your spam folder too.</span>
        ) : (
          <button type="button" className="btn btn--sm btn--ghost" disabled={state === "busy"} data-testid="verify-resend"
            onClick={async () => {
              setState("busy");
              const r = await apiV2Post<{ ok: boolean }>("/api/v2/auth/teacher/verify/resend", {});
              setState(r.ok ? "sent" : r.error);
            }}>
            {state === "busy" ? "One moment..." : "Send the email again"}
          </button>
        )}
      </p>
      {state !== "idle" && state !== "busy" && state !== "sent" && <p className="error-box" role="alert">{state}</p>}
    </div>
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

/** The school at a glance: totals of what the server counted for its classes. Nothing is estimated. */
function Glance({ classes }: { classes: ClassSummary[] }) {
  if (classes.length === 0) return null;
  const t = schoolTotals(classes);
  return (
    <dl className="glance" data-testid="school-glance">
      <div><dt>Classes</dt><dd data-testid="glance-classes">{t.classes}</dd></div>
      <div><dt>Students</dt><dd data-testid="glance-students">{t.students}</dd></div>
      <div><dt>Work handed in</dt>
        <dd data-testid="glance-done">{t.expected > 0 ? `${t.completed} of ${t.expected} (${t.percentDone}%)` : "Nothing assigned yet"}</dd></div>
      <div><dt>Next due</dt><dd data-testid="glance-due">{t.nextDue ? formatDue(t.nextDue) : "Nothing due"}</dd></div>
    </dl>
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
      {org.role === "org_admin" && (
        <p><Link href={`/classroom/school/${orgId}`} data-testid="school-overview-link">School overview</Link></p>
      )}
      {org.join_code && (
        <p className="muted small">
          Other teachers join with code <code className="code-chip" data-testid="org-code-value">{org.join_code}</code>.
        </p>
      )}
      <Glance classes={classes} />
      <h3 className="sub-h">Classes</h3>
      {classes.length === 0 ? <p className="muted">No classes yet.</p> : (
        <ul className="class-list">
          {classes.map((k) => (
            <li key={k.id}>
              <Link href={`/classroom/class/${k.id}`} data-testid="class-link">{k.name}</Link>{" "}
              <span className="muted small" data-testid="class-glance">{glanceParts(k).join(" · ")} · code{" "}
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
  const plan = studentPlan(home.assignments, new Date());
  return (
    <section className="card" aria-labelledby="my-h" data-testid="student-home">
      <p className="eyebrow">{home.class.name}</p>
      <h2 id="my-h" className="card-title">Hi, {home.nickname}</h2>
      {plan.total === 0 ? <p className="muted">Nothing assigned yet. Your teacher will add work here.</p> : (
        <>
          <p data-testid="progress">
            <strong>{plan.done} of {plan.total}</strong> done ({plan.percent}%)
          </p>
          <progress className="bar" max={plan.total} value={plan.done} aria-label="Assignments finished"
            data-testid="progress-bar" />
          {plan.next && (
            <div className="next-up" data-testid="my-assignment">
              <p className="eyebrow">Next up</p>
              <p className="next-up-title">{plan.next.title}</p>
              <StudentStatus a={plan.next} />
              <p><Link href={assignmentHref(plan.next)} className="btn btn--primary btn--sm" data-testid="next-up-go"
                aria-label={`${plan.next.result ? "Keep going" : "Start"}: ${plan.next.title}`}>
                {plan.next.result ? "Keep going" : "Start"}</Link></p>
            </div>
          )}
          {plan.todo.length > 0 && (
            <>
              <h3 className="sub-h">Still to do</h3>
              <ul className="assignment-list">{plan.todo.map((a) => <StudentRow key={a.id} a={a} />)}</ul>
            </>
          )}
          {plan.hunts.length > 0 && (
            <>
              <h3 className="sub-h">My hunts</h3>
              <ul className="assignment-list" data-testid="my-hunts">{plan.hunts.map((a) => <StudentRow key={a.id} a={a} hunt />)}</ul>
            </>
          )}
          {plan.finished.length > 0 && (
            <>
              <h3 className="sub-h">Finished</h3>
              <ul className="assignment-list" data-testid="finished">{plan.finished.map((a) => <StudentRow key={a.id} a={a} />)}</ul>
            </>
          )}
        </>
      )}
      <p className="muted small">Quiz scores count the questions you got right on the first try. A hunt keeps your best try.</p>
    </section>
  );
}

function StudentStatus({ a, hunt = false }: { a: StudentHome["assignments"][number]; hunt?: boolean }) {
  const status = planStatus(a, new Date());
  const r = a.result;
  return (
    <span className="muted small">
      {a.due_at ? ` due ${formatDue(a.due_at)} ` : ""}
      {status === "overdue" && <Badge tone="marginal">Past due</Badge>}{" "}
      {r ? (
        <Badge tone={r.completed_at ? "clean" : "info"}>
          {r.completed_at ? (hunt ? "Best" : "Done") : "Started"}: {r.score} of {r.max_score}
        </Badge>
      ) : <Badge tone="outline">Not started</Badge>}
    </span>
  );
}

function StudentRow({ a, hunt = false }: { a: StudentHome["assignments"][number]; hunt?: boolean }) {
  return (
    <li data-testid="my-assignment">
      <Link href={assignmentHref(a)}>{a.title}</Link> <StudentStatus a={a} hunt={hunt} />
    </li>
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
