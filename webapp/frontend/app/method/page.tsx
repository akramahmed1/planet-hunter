import { apiGet, type MethodResponse, type MethodStep } from "@/lib/api";

export const dynamic = "force-dynamic";

const FALLBACK_STEPS: MethodStep[] = [
  {
    title: "Download",
    body: "Pull TESS 2-minute cadence PDCSAP light curves from the MAST archive using the lightkurve package. The data is public and free, no key needed.",
  },
  {
    title: "Detrend",
    body: "Remove slow stellar and instrumental drifts with a Savitzky-Golay filter so the search sees dips, not long-term trends.",
  },
  {
    title: "Search with Box Least Squares",
    body: "Run astropy's Box Least Squares over periods from 1 to 40 days. BLS fits a box shape to folded light curves and scores how strongly each period repeats.",
  },
  {
    title: "Fold and plot",
    body: "Fold the light curve on the best-scoring period and plot it so the dip can be inspected by eye.",
  },
];

const FALLBACK_LIMITATIONS: string[] = [
  "BLS cannot rule out eclipsing binaries, blended stars, starspots, or instrument systematics. A strong dip is often stellar, not planetary.",
  "Only the strongest signal per target is reported. Weaker real signals are ignored.",
  "The batch scan uses only 2 sectors of data per target, while the validation used 4.",
  "No vetting tests are run: no odd-versus-even transit comparison, no secondary eclipse check, no centroid test, no transit shape vetting.",
  "BLS fits a simple box. Transit Least Squares (TLS) uses realistic planet shapes and is more sensitive.",
  "This pipeline does not beat NASA ExoMiner++: a deep learning classifier that flagged 7,000 candidates in a single January 2026 run.",
];

const FALLBACK_ROADMAP: string[] = [
  "Cross-match results with the NASA Exoplanet Archive and ExoMiner++ outputs.",
  "Add vetting tests: odd/even, secondary eclipse, centroid, and shape checks.",
  "Move from BLS to Transit Least Squares for better sensitivity.",
  "Stitch all available TESS sectors per target instead of just two.",
  "Compare against Planet Hunters TESS citizen science results.",
  "Submit surviving candidates to ExoFOP for professional follow-up.",
  "Never announce discoveries from this pipeline alone.",
];

const FALLBACK_EXOMINER_NOTE =
  "NASA's ExoMiner++ is a deep learning classifier that found 7,000 transit candidates in one January 2026 run. It sets the bar. This project is a learning build, not a competitor: a transparent, simple pipeline whose results anyone can reproduce and inspect.";

export default async function MethodPage() {
  const method = await apiGet<MethodResponse>("/api/method");

  const steps = method?.steps?.length ? method.steps : FALLBACK_STEPS;
  const limitations = method?.limitations?.length
    ? method.limitations
    : FALLBACK_LIMITATIONS;
  const roadmap = method?.roadmap?.length ? method.roadmap : FALLBACK_ROADMAP;
  const exominerNote = method?.exominer_note || FALLBACK_EXOMINER_NOTE;
  const dataSource = method?.data_source;

  return (
    <div>
      <h1>How it works</h1>
      <p className="lede">
        A simple, transparent pipeline. Nothing here is a black box, and every
        step is reproducible from public data.
      </p>

      {dataSource && Object.keys(dataSource).length > 0 && (
        <div className="panel">
          <h2>Data source</h2>
          <dl className="kv">
            {Object.entries(dataSource).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd style={{ fontWeight: 400 }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading">The four steps</h2>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading">Limitations, stated plainly</h2>
        <div className="panel">
          <ul className="bullet-list">
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="exominer-heading">
        <h2 id="exominer-heading">How this compares to the pros</h2>
        <div className="panel">
          <p>{exominerNote}</p>
        </div>
      </section>

      <section aria-labelledby="roadmap-heading">
        <h2 id="roadmap-heading">Roadmap (v2)</h2>
        <div className="panel">
          <ul className="bullet-list">
            {roadmap.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
