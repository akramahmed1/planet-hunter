"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton from "@/components/ui/Skeleton";
import { apiV2Send, type HuntResult, type StudentHome } from "@/lib/api-v2";
import { needsSignIn } from "@/lib/classroom";
import { parseNumber } from "@/lib/learn";

const VERDICT: Record<HuntResult["verdict"], string> = {
  exact: "Spot on.",
  close: "Close: the dips line up but smear a little.",
  harmonic: "You found a multiple or fraction of the period.",
  off: "Not yet: at that period the dips do not line up.",
};

/** A student's hunt challenge: find the period in the hunt lab, then submit it here. */
export default function HuntChallenge({ id }: { id: number }) {
  const [home, setHome] = useState<StudentHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<HuntResult | null>(null);
  useEffect(() => {
    apiV2Send<StudentHome>("GET", "/api/v2/me/assignments").then((r) =>
      r.ok ? setHome(r.data) : setError(r.status === 401 || r.status === 403 ? "Sign in as a student first." : r.error));
  }, []);
  if (error && !home) {
    return (
      <ErrorState title="This challenge could not be loaded." detail={error}>
        {needsSignIn(error) && <p><Link href="/classroom">Go to Classroom to sign in as a student</Link></p>}
      </ErrorState>
    );
  }
  if (!home) return <Skeleton height="6rem" />;
  const a = home.assignments.find((x) => x.id === id && x.kind === "hunt");
  if (!a) return <ErrorState title="No such hunt challenge in your class." detail="Check your assignments." />;
  const value = parseNumber(typed);
  return (
    <div data-testid="hunt-challenge">
      <h1>{a.title}</h1>
      <ol className="lede-list">
        <li>Open the <Link href={`/candidates/${a.ref}`}>hunt lab for this star</Link> and use &quot;Find the
          dip&quot; until the dips line up into one.</li>
        <li>Come back and enter the period you found, in days.</li>
      </ol>
      <form className="card form-card" onSubmit={async (e) => {
        e.preventDefault();
        if (value === null) return;
        const r = await apiV2Send<HuntResult>("POST", `/api/v2/me/assignments/${id}/hunt`, { period_d: value });
        if (r.ok) {
          setResult(r.data);
          setError(null);
        } else {
          setError(r.error);
        }
      }}>
        <label htmlFor="hunt-period" className="field-label">Period, in days</label>
        <input id="hunt-period" className="select quiz-input" inputMode="decimal" value={typed}
          onChange={(e) => setTyped(e.target.value)} data-testid="hunt-period" />
        <button type="submit" className="btn btn--primary" disabled={value === null || value <= 0}
          data-testid="hunt-submit">Submit</button>
        <div role="status" aria-live="polite">
          {result && (
            <p className="quiz-result" data-testid="hunt-result">
              {VERDICT[result.verdict]} {result.points} points this try; your best is {result.best}.
            </p>
          )}
        </div>
        {error && <p className="error-box" role="alert">{error}</p>}
      </form>
      <p><Link href="/classroom">Back to your assignments</Link></p>
    </div>
  );
}
