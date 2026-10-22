"use client";

import CsvDownload from "@/components/ui/CsvDownload";
import { useEffect, useState } from "react";
import ExplainBox from "@/components/explain/ExplainBox";
import HuntLab from "@/components/hunt/HuntLab";
import RunLabel from "@/components/RunLabel";
import Badge from "@/components/ui/Badge";
import {
  apiV2Get,
  type LightCurveResponse,
  type PeriodogramResponse,
  type ScanStatus,
} from "@/lib/api-v2";

const POLL_MS = 3000;
const STATUS_TONE = { pass: "clean", warn: "ambiguous", fail: "eclipsing", unknown: "unreviewed" } as const;
const STATUS_WORD = { pass: "Pass", warn: "Warning", fail: "Fail", unknown: "Can't tell" } as const;

export default function ScanResult({ id, initial }: { id: number; initial: ScanStatus }) {
  const [scan, setScan] = useState<ScanStatus>(initial);
  const [lc, setLc] = useState<LightCurveResponse | null>(null);
  const [pg, setPg] = useState<PeriodogramResponse | null>(null);
  const done = scan.status === "succeeded" || scan.status === "failed";

  useEffect(() => {
    if (done) return;
    const t = setTimeout(async () => {
      const r = await apiV2Get<ScanStatus>(`/api/v2/scans/${id}`);
      if (r.ok) setScan(r.data);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [id, scan, done]);

  useEffect(() => {
    if (scan.status !== "succeeded") return;
    (async () => {
      const [a, b] = await Promise.all([
        apiV2Get<LightCurveResponse>(`/api/v2/scans/${id}/lightcurve`),
        apiV2Get<PeriodogramResponse>(`/api/v2/scans/${id}/periodogram`),
      ]);
      if (a.ok) setLc(a.data);
      if (b.ok) setPg(b.data);
    })();
  }, [id, scan.status]);

  const name = scan.toi ?? `TIC ${scan.tic_id}`;
  const sig = scan.signal;
  return (
    <div className="scan">
      <p className="eyebrow">TIC {scan.tic_id}</p>
      <h1>Scan of {name}</h1>
      <div aria-live="polite" data-testid="scan-status">
        {scan.status === "queued" && <p>Waiting in the queue...</p>}
        {scan.status === "running" && <p>Scanning: {scan.progress ?? "starting"}...</p>}
        {scan.status === "failed" && (
          <p className="error-box" role="alert">This scan failed: {scan.error}</p>
        )}
        {scan.status === "queued" && scan.error && (
          <p className="muted small">The last try failed ({scan.error}); it will try again.</p>
        )}
      </div>

      {sig && (
        <>
          <section className="card hunt-card" aria-labelledby="sig-h" data-testid="scan-signal">
            <h2 id="sig-h" className="card-title">The strongest signal</h2>
            {scan.sectors && scan.sectors.length > 0 && (
              <p><RunLabel kind="scan" sectors={scan.sectors.length} date={scan.finished_at?.slice(0, 10)} /></p>
            )}
            <dl className="kv">
              <dt>Period</dt><dd className="num">{sig.period_d.toFixed(4)} days</dd>
              <dt>Depth</dt><dd className="num">{Math.round(sig.depth_ppm).toLocaleString("en-US")} ppm</dd>
              <dt>Duration</dt><dd className="num">{(sig.duration_d * 24).toFixed(1)} hours</dd>
              <dt>SNR</dt><dd className="num">{sig.snr.toFixed(1)}</dd>
              <dt>Sectors</dt><dd className="num">{(scan.sectors ?? []).join(", ")}</dd>
            </dl>
            <CsvDownload
              label="Download this result (CSV)"
              fileParts={[name, "scan"]}
              note="One row: the signal and what each vetting check said."
              rows={() => [
                ["tic_id", "target", "period_d", "depth_ppm", "duration_d", "snr", "label", "label_status", "sectors",
                  ...sig.vetting.map((v) => `vetting_${v.id}`)],
                [scan.tic_id, name, sig.period_d, sig.depth_ppm, sig.duration_d, sig.snr, sig.crossmatch.label_text,
                  sig.label_status, (scan.sectors ?? []).join(" "), ...sig.vetting.map((v) => v.status)],
              ]}
            />
            <p>
              <Badge tone="info">{sig.crossmatch.label_text}</Badge>{" "}
              <span className="muted" data-testid="label-status">({sig.label_status})</span>
            </p>
            <p className="muted small">
              A label proposed by the computer from the catalogs and tests below. No person has reviewed it. A
              candidate signal is never a discovery.
            </p>
          </section>

          <section className="card hunt-card" aria-labelledby="vet-h">
            <h2 id="vet-h" className="card-title">Vetting checks</h2>
            <ul className="vet-list" data-testid="vetting">
              {sig.vetting.map((v) => (
                <li key={v.id} data-testid={`vet-${v.id}`}>
                  <Badge tone={STATUS_TONE[v.status]}>{STATUS_WORD[v.status]}</Badge> <strong>{v.name}.</strong>{" "}
                  {v.explanation}
                </li>
              ))}
            </ul>
          </section>

          <section className="card hunt-card" aria-labelledby="xm-h">
            <h2 id="xm-h" className="card-title">What the catalogs know</h2>
            {sig.crossmatch.matches.length === 0 ? (
              <p>No known planet, planet candidate or eclipsing binary at this period (within 1%).</p>
            ) : (
              <ul className="vet-list" data-testid="crossmatch">
                {sig.crossmatch.matches.map((m) => (
                  <li key={`${m.kind}-${m.name}`}>
                    <strong>{m.name}</strong>: {m.period_d.toFixed(4)} days, {m.relation} of this signal
                    {m.disposition ? ` (TFOPWG disposition ${m.disposition})` : ""}.{" "}
                    <a href={m.source.url} target="_blank" rel="noopener noreferrer">{m.source.name}</a>
                  </li>
                ))}
              </ul>
            )}
            {sig.crossmatch.note && <p className="muted small">{sig.crossmatch.note}</p>}
          </section>

          {lc && pg && <HuntLab lc={lc} pg={pg} answerPeriod={sig.period_d} classification="" />}
          <ExplainBox kind="scan" refId={String(id)} />
        </>
      )}
    </div>
  );
}
