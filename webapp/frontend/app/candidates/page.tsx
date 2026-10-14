import ApiError from "@/components/ApiError";
import CandidatesTable from "@/components/CandidatesTable";
import {
  apiGet,
  numberWord,
  scanSummarySentence,
  type CandidatesResponse,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const res = await apiGet<CandidatesResponse>("/api/candidates");

  if (!res.ok) {
    return (
      <div>
        <h1>Candidate signals</h1>
        <ApiError what="The candidate list" error={res.error} />
      </div>
    );
  }

  const { run, summary, candidates, honesty } = res.data;

  return (
    <div>
      <h1>Candidate signals</h1>
      <p className="lede">
        {numberWord(summary.count, true)} targets, one strongest signal each.{" "}
        {scanSummarySentence(summary)} Click any target for the full readout.
      </p>
      <p className="muted">
        Scan run: {run.run_date}. {run.sectors_per_target} sectors per target.
        Periods searched: {run.search_period_min_d} to {run.search_period_max_d}{" "}
        days. {honesty}
      </p>
      <CandidatesTable candidates={candidates} />
    </div>
  );
}
