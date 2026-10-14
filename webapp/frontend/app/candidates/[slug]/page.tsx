import Link from "next/link";
import { notFound } from "next/navigation";
import ApiError from "@/components/ApiError";
import ClassificationBadge from "@/components/ClassificationBadge";
import {
  apiGet,
  labelFor,
  plotImageUrl,
  type Candidate,
  type HealthResponse,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [res, health] = await Promise.all([
    apiGet<Candidate>(`/api/candidates/${encodeURIComponent(slug)}`),
    apiGet<HealthResponse>("/api/health"),
  ]);

  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div>
        <p className="muted">
          <Link href="/candidates">← Back to all candidates</Link>
        </p>
        <ApiError what="This candidate" error={res.error} />
      </div>
    );
  }

  const candidate = res.data;
  const total = health.ok ? health.data.candidate_count : null;

  const plotSrc = plotImageUrl(candidate.plot_url);

  return (
    <div>
      <p className="muted">
        <Link href="/candidates">← Back to all candidates</Link>
      </p>

      <h1>
        {candidate.target}{" "}
        <span className="muted" style={{ fontWeight: 400 }}>
          {candidate.tic}
        </span>
      </h1>
      <p>
        <ClassificationBadge
          classification={candidate.classification}
          label={labelFor(candidate)}
        />
      </p>

      <div className="detail-grid">
        <div className="panel">
          <h2>Measured numbers</h2>
          <dl className="kv">
            <dt>Rank</dt>
            <dd>
              #{candidate.rank}
              {total ? ` of ${total}` : ""}
            </dd>
            <dt>Period</dt>
            <dd className="num">{candidate.period_d.toFixed(4)} days</dd>
            <dt>Transit duration</dt>
            <dd className="num">{candidate.duration_d.toFixed(3)} days</dd>
            <dt>Depth</dt>
            <dd className="num">
              {candidate.depth_ppm.toLocaleString("en-US")} ppm
            </dd>
            <dt>SNR</dt>
            <dd className="num">{candidate.snr.toFixed(1)}</dd>
            <dt>BLS power</dt>
            <dd className="num">{candidate.bls_power}</dd>
            <dt>Cadences</dt>
            <dd className="num">
              {candidate.n_cadences.toLocaleString("en-US")}
            </dd>
          </dl>
        </div>

        <div>
          <h2>Readout</h2>
          <div className="readout">
            <p>{candidate.readout}</p>
          </div>
        </div>
      </div>

      <section aria-labelledby="plot-heading">
        <h2 id="plot-heading">Folded light curve</h2>
        {plotSrc ? (
          <div className="plot-frame" style={{ maxWidth: "720px" }}>
            <img
              src={plotSrc}
              alt={`Folded light curve of ${candidate.target} at the recovered period of ${candidate.period_d.toFixed(4)} days`}
            />
          </div>
        ) : (
          <div className="panel">
            <p className="muted" style={{ margin: 0 }}>
              No folded plot was rendered for this target in this scan run.
            </p>
          </div>
        )}
      </section>

      <div className="not-note" role="note">
        <p>
          <strong>What this is NOT.</strong> This is a candidate signal from a
          demo pipeline, not a discovery. The search found a repeating dip and
          reported its numbers. Confirming a planet needs professional
          follow-up: more data, vetting tests, and usually radial velocity or
          additional transits. Nothing here announces a planet.
        </p>
      </div>
    </div>
  );
}
