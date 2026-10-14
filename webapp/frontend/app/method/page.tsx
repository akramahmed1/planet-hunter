import ApiError from "@/components/ApiError";
import { apiGet, type MethodResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MethodPage() {
  const res = await apiGet<MethodResponse>("/api/method");

  if (!res.ok) {
    return (
      <div>
        <h1>How it works</h1>
        <ApiError what="The method description" error={res.error} />
      </div>
    );
  }

  const {
    steps,
    limitations,
    roadmap,
    exominer_note: exominerNote,
    data_source: dataSource,
  } = res.data;

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
        <h2 id="steps-heading">The steps</h2>
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
