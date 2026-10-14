import Link from "next/link";
import ApiError from "@/components/ApiError";
import {
  apiGet,
  numberWord,
  plotImageUrl,
  scanSummarySentence,
  type OverviewResponse,
} from "@/lib/api";

export const dynamic = "force-dynamic";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function Home() {
  const res = await apiGet<OverviewResponse>("/api/overview");
  const overview = res.ok ? res.data : null;
  const validation = overview?.validation ?? null;
  const summary = overview?.summary ?? null;
  const plotSrc = plotImageUrl(validation?.plot_url ?? null);

  return (
    <div className="hero">
      <div className="banner banner-caution" role="note">
        <p>
          <strong>Candidate, not discovery.</strong> This is a build-in-public
          demo of a transit search pipeline. Every signal shown here is a
          candidate signal. None of it is a discovery, and nothing here
          announces one.
        </p>
      </div>

      <h1>Planet Hunter</h1>
      <p className="lede">
        An open experiment that hunts for repeating dips in public NASA TESS
        telescope data. A dip can mean a planet crossing its star. It can also
        mean a binary star, starspots, or instrument noise. This site shows
        what the search found and labels each one honestly.
      </p>

      <section aria-labelledby="proof-heading">
        <h2 id="proof-heading" className="section-title">
          The proof: a known planet, recovered blind
        </h2>
        {validation ? (
          <div className="panel">
            <div className="proof-grid">
              <div>
                <p>
                  We pointed the pipeline at {validation.target} (
                  {validation.tic}), a star with a known planet,{" "}
                  {validation.planet}, and asked it to find the period. The
                  pipeline knew nothing about the planet ahead of time.
                </p>
                <ul className="proof-facts">
                  <li>
                    Recovered period:{" "}
                    <strong>{validation.recovered_period_d} days</strong>
                  </li>
                  <li>
                    Published period:{" "}
                    <strong>{validation.published_period_d} days</strong>
                  </li>
                  <li>
                    Error: <strong>{validation.period_error_pct}%</strong>
                  </li>
                  <li>
                    Cadences analyzed:{" "}
                    <strong>{formatInt(validation.n_cadences)}</strong>
                  </li>
                  <li>
                    Transit depth:{" "}
                    <strong>{formatInt(validation.depth_ppm)} ppm</strong>
                  </li>
                  <li>
                    Sectors used: <strong>{validation.sectors}</strong>
                  </li>
                  <li>
                    Data: <strong>{validation.data}</strong>
                  </li>
                  <li>
                    Archive: <strong>{validation.archive}</strong>
                  </li>
                </ul>
              </div>
              <div className="proof-plot">
                {plotSrc ? (
                  <img
                    src={plotSrc}
                    alt={`Folded light curve of ${validation.target} at the recovered period of ${validation.recovered_period_d} days`}
                  />
                ) : (
                  <p className="muted">No folded plot available.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <ApiError what="The validation result" error={res.ok ? "" : res.error} />
        )}
      </section>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="section-title">
          What the scan found
        </h2>
        {overview && summary && validation ? (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-num">{validation.sectors}</div>
                <div className="stat-label">validation sectors</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{summary.count}</div>
                <div className="stat-label">targets scanned</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">
                  {summary.by_classification["clean-recovery"]}
                </div>
                <div className="stat-label">clean recoveries</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{summary.by_classification.ambiguous}</div>
                <div className="stat-label">ambiguous signals</div>
              </div>
            </div>
            <p className="muted">
              Scan of {numberWord(summary.count)} targets on {overview.run.run_date}.{" "}
              {scanSummarySentence(summary)} See the full list on the candidates
              page.
            </p>
          </>
        ) : (
          <ApiError what="The scan summary" error={res.ok ? "" : res.error} />
        )}
      </section>

      <section aria-labelledby="what-heading">
        <h2 id="what-heading" className="section-title">
          What this does, in plain words
        </h2>
        <div className="panel">
          <p>
            It downloads brightness measurements from NASA&apos;s TESS
            telescope, removes slow drifts in the data, then runs a search that
            looks for repeating dips. When it finds one, it folds the data on
            that period and draws the light curve so you can see the dip with
            your own eyes.
          </p>
          <p>
            The pipeline only reports the strongest signal per target. It does
            not do the follow-up vetting that professionals run, like
            odd-versus-even transit checks, secondary eclipse searches, or
            centroid tests. That is why everything here stays a candidate.
          </p>
        </div>
        <div className="banner banner-honest" role="note">
          <p>
            <strong>Honesty first.</strong> Unexplained signals could be false
            positives, so they are labeled ambiguous on purpose. Astronomy is
            full of almost-planets that turned out to be something else.
          </p>
        </div>
        <div className="link-row">
          <Link href="/candidates" className="btn">
            {summary ? `See all ${summary.count} candidates` : "See the candidates"}
          </Link>
          <Link href="/method" className="btn btn-ghost">
            How it works
          </Link>
        </div>
      </section>
    </div>
  );
}
