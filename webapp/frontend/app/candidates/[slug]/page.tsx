import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ApiError from "@/components/ApiError";
import RunLabel from "@/components/RunLabel";
import ClassificationBadge from "@/components/ClassificationBadge";
import Card from "@/components/ui/Card";
import ExplainBox from "@/components/explain/ExplainBox";
import HuntLab from "@/components/hunt/HuntLab";
import SkyPanel from "@/components/sky/SkyPanel";
import EmptyState from "@/components/ui/EmptyState";
import { apiV2Get, type LightCurveResponse, type PeriodogramResponse, type TargetsResponse } from "@/lib/api-v2";
import {
  apiGet,
  labelFor,
  plotImageUrl,
  type Candidate,
  type HealthResponse,
  type OverviewResponse,
} from "@/lib/api";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // An unknown address renders the 404 page, so its tab title must not repeat the made-up name.
  const known = await apiGet<Candidate>(`/api/candidates/${encodeURIComponent(slug)}`);
  if (!known.ok && known.status === 404) return { title: "Page not found" };
  const name = slug.toUpperCase().replace("-", " ");
  return {
    title: `${name} candidate signal`,
    description: `${name}: the strongest repeating dip our pipeline found, with its checks. A candidate signal, never a discovery.`,
  };
}

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [res, health, targets, lc, pg, overview] = await Promise.all([
    apiGet<Candidate>(`/api/candidates/${encodeURIComponent(slug)}`),
    apiGet<HealthResponse>("/api/health"),
    apiV2Get<TargetsResponse>("/api/v2/targets"),
    apiV2Get<LightCurveResponse>(`/api/v2/lightcurves/${encodeURIComponent(slug)}`),
    apiV2Get<PeriodogramResponse>(`/api/v2/periodogram/${encodeURIComponent(slug)}`),
    apiGet<OverviewResponse>("/api/overview"),
  ]);

  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div>
        <p>
          <Link href="/candidates" className="back-link">← Back to all candidates</Link>
        </p>
        <ApiError what="This candidate" error={res.error} />
      </div>
    );
  }

  const candidate = res.data;
  const total = health.ok ? health.data.candidate_count : null;

  const plotSrc = plotImageUrl(candidate.plot_url);
  const target = targets.ok ? targets.data.targets.find((t) => t.slug === candidate.slug) : undefined;

  return (
    <div>
      <p>
        <Link href="/candidates" className="back-link">← Back to all candidates</Link>
      </p>

      <p className="eyebrow">{candidate.tic}</p>
      <h1>{candidate.target}</h1>
      <p>
        <ClassificationBadge
          classification={candidate.classification}
          label={labelFor(candidate)}
        />
      </p>

      <div className="detail-grid">
        <Card title="Measured numbers">
          {overview.ok && (
            <p>
              <RunLabel kind="batch" sectors={overview.data.run.sectors_per_target} date={overview.data.run.run_date} />
            </p>
          )}
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
        </Card>

        <Card title="Readout" tone="flat">
          <div className="readout">
            <p>{candidate.readout}</p>
          </div>
        </Card>
      </div>

      {lc.ok && pg.ok && (
        <section aria-labelledby="lab-heading">
          <h2 id="lab-heading">Hunt lab</h2>
          <HuntLab lc={lc.data} pg={pg.data} answerPeriod={candidate.period_d} classification={candidate.classification} />
        </section>
      )}

      <ExplainBox kind="candidate" refId={candidate.slug} />

      <section aria-labelledby="plot-heading">
        <h2 id="plot-heading">{lc.ok && pg.ok ? "The pipeline's folded plot" : "Folded light curve"}</h2>
        {plotSrc ? (
          <div className="plot-frame" style={{ maxWidth: "760px" }}>
            <img
              src={plotSrc}
              alt={`Folded light curve of ${candidate.target} at the recovered period of ${candidate.period_d.toFixed(4)} days`}
            />
          </div>
        ) : (
          <EmptyState title="No folded plot for this target.">
            <p>No folded plot was rendered for this target in this scan run.</p>
          </EmptyState>
        )}
      </section>

      {target && (
        <>
          <p>
            <Link href={`/exoplanets/${target.slug}`} className="btn" data-testid="system-link">
              See the {target.target} system in 3D
            </Link>
          </p>
          <SkyPanel name={target.target} ra={target.ra_deg} dec={target.dec_deg}
            source={targets.ok ? targets.data.star_source : { name: "", url: "" }} />
        </>
      )}

      <div className="callout callout--nova" role="note">
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
