"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import Toggle from "@/components/ui/Toggle";
import { apiV2Post } from "@/lib/api-v2";

type Who = "student" | "teacher";
const WHO_OPTIONS = [
  { value: "student" as const, label: "I'm a student", title: "I'm a student" },
  { value: "teacher" as const, label: "I'm a teacher", title: "I'm a teacher" },
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];
const AGE_BLOCK_KEY = "ph-age-blocked";

function ageBlocked(): boolean {
  try {
    return window.sessionStorage.getItem(AGE_BLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function Field({ label, children, hint }: { label: string; children: (id: string, hintId?: string) => ReactNode;
  hint?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">{label}</label>
      {children(id, hintId)}
      {hint && <p id={hintId} className="muted small">{hint}</p>}
    </div>
  );
}

/** Birth month and year from lists: a neutral age question (ADR 0005). Only the 13+ outcome is kept. */
function BirthFields({ month, year, onMonth, onYear }: { month: string; year: string; onMonth: (v: string) => void;
  onYear: (v: string) => void }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i);
  return (
    <fieldset className="field birth">
      <legend className="field-label">When were you born?</legend>
      <p className="muted small">We only keep whether you are 13 or older, never the date.</p>
      <div className="birth-row">
        <label className="sr-only" htmlFor="birth-month">Month</label>
        <select id="birth-month" className="select" value={month} onChange={(e) => onMonth(e.target.value)} required
          data-testid="birth-month">
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <label className="sr-only" htmlFor="birth-year">Year</label>
        <select id="birth-year" className="select" value={year} onChange={(e) => onYear(e.target.value)} required
          data-testid="birth-year">
          <option value="">Year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </fieldset>
  );
}

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [who, setWho] = useState<Who>("student");
  return (
    <div className="signin">
      <Toggle legend="Who are you?" options={WHO_OPTIONS} value={who} onChange={setWho} />
      {who === "student" ? <StudentForms onDone={onSignedIn} /> : <TeacherForms onDone={onSignedIn} />}
      <p className="muted small">
        Accounts are for ages 13 and up. Read the <Link href="/privacy">draft privacy notice</Link> to see what we
        store.
      </p>
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: `/api/v2/${string}`, body: unknown, isAgeCheck = false) {
    setBusy(true);
    setError(null);
    const r = await apiV2Post<{ ok: boolean }>(path, body);
    setBusy(false);
    if (r.ok) return onDone();
    if (isAgeCheck && r.status === 403) {
      try {
        window.sessionStorage.setItem(AGE_BLOCK_KEY, "1");
      } catch {
        // the server also remembers this for the session
      }
    }
    setError(r.error);
  }
  return { busy, error, run };
}

function AgeBlocked() {
  return (
    <div className="callout" role="status" data-testid="age-blocked">
      <p>
        Planet Hunter accounts are for people aged 13 and up. You can still explore everything on the site without an
        account: <Link href="/learn">try a lesson</Link> or <Link href="/candidates">hunt for planets</Link>.
      </p>
    </div>
  );
}

function StudentForms({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"join" | "login">("join");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  const blocked = mode === "join" && (ageBlocked() || error?.includes("13 and up"));

  if (blocked) return <AgeBlocked />;
  return (
    <form className="card form-card" data-testid="student-form" onSubmit={(e) => {
      e.preventDefault();
      if (mode === "join") {
        run("/api/v2/auth/student/join", { class_code: code, nickname, pin, birth_month: Number(month),
          birth_year: Number(year) }, true);
      } else {
        run("/api/v2/auth/student/login", { class_code: code, nickname, pin });
      }
    }}>
      <h2 className="card-title">{mode === "join" ? "Join a class" : "Sign back in"}</h2>
      <Field label="Class code" hint="Your teacher gives you this.">
        {(id, hintId) => <input id={id} className="select" value={code} onChange={(e) => setCode(e.target.value)}
          aria-describedby={hintId} autoComplete="off" spellCheck={false} required maxLength={20}
          data-testid="class-code" />}
      </Field>
      <Field label="Nickname" hint="Not your real name. Your teacher sees it; other students do not.">
        {(id, hintId) => <input id={id} className="select" value={nickname} onChange={(e) => setNickname(e.target.value)}
          aria-describedby={hintId} autoComplete="off" required maxLength={24} data-testid="nickname" />}
      </Field>
      <Field label="PIN" hint="4 to 8 digits. If you forget it, your teacher can reset it.">
        {(id, hintId) => <input id={id} className="select" value={pin} onChange={(e) => setPin(e.target.value)}
          aria-describedby={hintId} inputMode="numeric" type="password" autoComplete="off" required maxLength={8}
          pattern="[0-9]{4,8}" data-testid="pin" />}
      </Field>
      {mode === "join" && <BirthFields month={month} year={year} onMonth={setMonth} onYear={setYear} />}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={busy} data-testid="student-submit">
          {busy ? "One moment..." : mode === "join" ? "Join the class" : "Sign in"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setMode(mode === "join" ? "login" : "join")}>
          {mode === "join" ? "I already joined" : "Join a class instead"}
        </button>
      </div>
      {error && <p className="error-box" role="alert" data-testid="form-error">{error}</p>}
    </form>
  );
}

function TeacherForms({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgMode, setOrgMode] = useState<"new" | "join">("new");
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  const blocked = mode === "signup" && (ageBlocked() || error?.includes("13 and up"));

  if (blocked) return <AgeBlocked />;
  return (
    <form className="card form-card" data-testid="teacher-form" onSubmit={(e) => {
      e.preventDefault();
      if (mode === "login") {
        run("/api/v2/auth/teacher/login", { email, password });
      } else {
        run("/api/v2/auth/teacher/signup", {
          email, password, display_name: name, birth_month: Number(month), birth_year: Number(year),
          ...(orgMode === "new" ? { org_name: orgName } : { org_code: orgCode }),
        }, true);
      }
    }}>
      <h2 className="card-title">{mode === "login" ? "Teacher sign in" : "Create a teacher account"}</h2>
      {mode === "signup" && (
        <Field label="Your name, as students will see it">
          {(id) => <input id={id} className="select" value={name} onChange={(e) => setName(e.target.value)} required
            maxLength={80} autoComplete="name" data-testid="teacher-name" />}
        </Field>
      )}
      <Field label="Email">
        {(id) => <input id={id} className="select" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required maxLength={254} autoComplete="email" data-testid="teacher-email" />}
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 10 characters." : undefined}>
        {(id, hintId) => <input id={id} className="select" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} aria-describedby={hintId} required minLength={mode === "signup" ? 10 : 1}
          maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"}
          data-testid="teacher-password" />}
      </Field>
      {mode === "signup" && (
        <>
          <fieldset className="field">
            <legend className="field-label">School or group</legend>
            <div className="radio-row">
              <label><input type="radio" name="org-mode" checked={orgMode === "new"} onChange={() => setOrgMode("new")} />
                {" "}Start a new one</label>
              <label><input type="radio" name="org-mode" checked={orgMode === "join"}
                onChange={() => setOrgMode("join")} />{" "}Join one with a code</label>
            </div>
            {orgMode === "new" ? (
              <>
                <label htmlFor="org-name" className="sr-only">Name of the school or group</label>
                <input id="org-name" className="select" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Name of the school or group" required minLength={2} maxLength={120}
                  data-testid="org-name" />
              </>
            ) : (
              <>
                <label htmlFor="org-code" className="sr-only">Join code from your school's admin</label>
                <input id="org-code" className="select" value={orgCode} onChange={(e) => setOrgCode(e.target.value)}
                  placeholder="Join code from your school's admin" required maxLength={20} data-testid="org-code" />
              </>
            )}
          </fieldset>
          <BirthFields month={month} year={year} onMonth={setMonth} onYear={setYear} />
        </>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={busy} data-testid="teacher-submit">
          {busy ? "One moment..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Create an account" : "I have an account"}
        </button>
      </div>
      {error && <p className="error-box" role="alert" data-testid="form-error">{error}</p>}
    </form>
  );
}
