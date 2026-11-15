import Link from "next/link";
import RunLabel from "@/components/RunLabel";
import EarthHero from "@/components/hero/EarthHero";
import DoorBand from "@/components/welcome/DoorBand";
import { getFeatures } from "@/lib/features";
import { Suspense } from "react";
import ApiError from "@/components/ApiError";
import LiveTiles from "@/components/live/LiveTiles";
import TilesSkeleton from "@/components/live/TilesSkeleton";
import { ButtonLink } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Stat from "@/components/ui/Stat";
import {
  apiGet,
  numberWord,
  plotImageUrl,
  scanSummarySentence,
  type OverviewResponse,
} from "@/lib/api";
import { count, noun } from "@/lib/plural";
import Tap from "@/components/ui/Tap";
import AgeText from "@/components/AgeText";

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
  const { classroom } = await getFeatures();

  return (
    <div className="hero">
      {classroom && <DoorBand />}
      <div className="hero-head">
      <div className="hero-copy">
      <p className="eyebrow">Real NASA telescope data</p>
      <h1>Planet Hunter</h1>
      <p className="lede">
        An open experiment that hunts for repeating dips in public NASA TESS
        telescope data. A dip can mean a planet crossing its star. It can also
        mean a binary star, starspots, or instrument noise. This site shows
        what the search found and labels each one honestly.
      </p>
      </div>
      <EarthHero />
      </div>

      <div className="callout" role="note">
        <p>
          <strong>Candidate, not discovery.</strong> This is a build-in-public
          demo of a transit search pipeline. Every signal shown here is a
          candidate signal. None of it is a discovery, and nothing here
          announces one.
        </p>
      </div>

      <div className="btn-row">
        <ButtonLink href="/candidates" variant="primary">
          {summary ? `See all ${count(summary.count, "candidate")}` : "See the candidates"}
        </ButtonLink>
        <ButtonLink href="/method" variant="ghost">
          How it works
        </ButtonLink>
      </div>

      <section aria-labelledby="live-heading">
        <h2 id="live-heading">Live from space</h2>
        <p className="muted"><Tap /> any value to see where it comes from and when it was fetched.</p>
        <Suspense fallback={<TilesSkeleton />}>
          <LiveTiles />
        </Suspense>
      </section>

      <section aria-labelledby="start-heading">
        <h2 id="start-heading">Where to start</h2>
        <ul className="start-grid" data-testid="start-here">
          <li><Link href="/candidates" className="start-card">
            <strong>Hunt for planets</strong>
            <span>Find the dip in real TESS data and see how the pipeline scored it.</span></Link></li>
          <li><Link href="/solar-system" className="start-card">
            <strong>Fly the solar system</strong>
            <span>See where the planets are today, to scale.</span></Link></li>
          <li><Link href="/learn" className="start-card">
            <strong>Take a lesson</strong>
            <span>Short lessons with quizzes. No account needed.</span></Link></li>
        </ul>
      </section>

      <section aria-labelledby="proof-heading">
        <h2 id="proof-heading">The proof: a known planet, recovered blind</h2>
        {validation ? (
          <Card tone="glow">
            <div className="proof-grid">
              <div>
                <p>
                  We pointed the pipeline at {validation.target} (
                  {validation.tic}), a star with a known planet,{" "}
                  {validation.planet}, and asked it to find the period. The
                  pipeline knew nothing about the planet ahead of time.
                </p>
                <p><RunLabel kind="validation" sectors={validation.sectors} /></p>
                <ul className="fact-list">
                  <li>
                    Recovered period <strong>{validation.recovered_period_d} days</strong>
                  </li>
                  <li>
                    Published period <strong>{validation.published_period_d} days</strong>
                  </li>
                  <li>
                    Error <strong>{validation.period_error_pct}%</strong>
                  </li>
                  <li>
                    Cadences analyzed <strong>{formatInt(validation.n_cadences)}</strong>
                  </li>
                  <li>
                    Transit depth <strong>{formatInt(validation.depth_ppm)} ppm</strong>
                  </li>
                  <li>
                    Sectors used <strong>{validation.sectors}</strong>
                  </li>
                  <li>
                    Data <strong>{validation.data}</strong>
                  </li>
                  <li>
                    Archive <strong>{validation.archive}</strong>
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
          </Card>
        ) : (
          <ApiError what="The validation result" error={res.ok ? "" : res.error} />
        )}
      </section>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading">What the scan found</h2>
        {overview && summary && validation ? (
          <>
            <div className="stat-grid">
              <Stat value={validation.sectors} label={noun(validation.sectors, "validation sector")} />
              <Stat value={summary.count} label={noun(summary.count, "target scanned", "targets scanned")} />
              <Stat value={summary.by_classification["clean-recovery"]} label={noun(summary.by_classification["clean-recovery"], "clean recovery", "clean recoveries")} />
              <Stat value={summary.by_classification.ambiguous} label={noun(summary.by_classification.ambiguous, "ambiguous signal")} />
            </div>
            <p className="muted">
              Scan of {numberWord(summary.count)} {noun(summary.count, "target")} on {overview.run.run_date} (<AgeText date={overview.run.run_date} />).{" "}
              {scanSummarySentence(summary)} See the full list on the candidates
              page.
            </p>
          </>
        ) : (
          <ApiError what="The scan summary" error={res.ok ? "" : res.error} />
        )}
      </section>

      <section aria-labelledby="what-heading">
        <h2 id="what-heading">What this does, in plain words</h2>
        <Card>
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
        </Card>
        <div className="callout callout--nova" role="note">
          <p>
            <strong>Honesty first.</strong> Unexplained signals could be false
            positives, so they are labeled ambiguous on purpose. Astronomy is
            full of almost-planets that turned out to be something else.
          </p>
        </div>
      </section>
    </div>
  );
}
