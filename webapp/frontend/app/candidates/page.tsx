import CandidatesTable from "@/components/CandidatesTable";
import { apiGet, type CandidatesResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const data = await apiGet<CandidatesResponse>("/api/candidates");

  return (
    <div>
      <h1>Candidate signals</h1>
      <p className="lede">
        Eight targets, one strongest signal each. Three matched known planets
        cleanly. One is an eclipsing binary, not a planet. Two are ambiguous
        and stay unexplained on purpose. The rest were weak or likely noise.
        Click any target for the full readout.
      </p>

      {data ? (
        <>
          <p className="muted">
            Scan run: {data.run_date}. {data.sectors_per_target} sectors per
            target. Count: {data.count}.
          </p>
          <CandidatesTable candidates={data.candidates} />
        </>
      ) : (
        <div className="error-box">
          <p>
            The candidate list could not be loaded. The backend API may be
            offline. Expected at http://127.0.0.1:8000 unless
            NEXT_PUBLIC_API_BASE is set.
          </p>
        </div>
      )}
    </div>
  );
}
