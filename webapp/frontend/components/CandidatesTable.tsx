"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import CsvDownload from "@/components/ui/CsvDownload";
import ClassificationBadge from "@/components/ClassificationBadge";
import EmptyState from "@/components/ui/EmptyState";
import {
  CLASSIFICATION_LABELS,
  labelFor,
  type Candidate,
  type Classification,
} from "@/lib/api";
import { noun } from "@/lib/plural";

type SortKey = "rank" | "period_d" | "depth_ppm" | "snr";

const FILTER_ORDER: Classification[] = [
  "clean-recovery",
  "eclipsing-binary",
  "ambiguous",
  "marginal",
  "likely-noise",
  "unreviewed",
];

const HEADERS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "Rank" },
  { key: "period_d", label: "Period (d)" },
  { key: "depth_ppm", label: "Depth (ppm)" },
  { key: "snr", label: "SNR" },
];

/**
 * The candidate list: cards on phones, a sortable table on wider screens.
 * Both share one filter and sort state; CSS shows whichever fits.
 */
export default function CandidatesTable({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<Classification | "all">("all");

  // Only offer filters for classifications that exist in this run.
  const FILTERS = useMemo(() => {
    const present = new Set(candidates.map((c) => c.classification));
    return [
      { value: "all" as const, label: "All" },
      ...FILTER_ORDER.filter((c) => present.has(c)).map((c) => ({
        value: c,
        label: CLASSIFICATION_LABELS[c],
      })),
    ];
  }, [candidates]);

  const rows = useMemo(() => {
    const filtered =
      filter === "all"
        ? [...candidates]
        : candidates.filter((c) => c.classification === filter);
    filtered.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? diff : -diff;
    });
    return filtered;
  }, [candidates, sortKey, sortDir, filter]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div>
      <div className="filter-row" role="group" aria-label="Filter by classification">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="filter-btn"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="list-toolbar">
        <p className="muted" style={{ margin: 0 }} aria-live="polite">
          {rows.length} of {candidates.length} {noun(candidates.length, "candidate signal")} shown.
        </p>
        <label className="select-label">
          Sort by
          <select
            className="select"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
              setSortKey(k);
              setSortDir(d);
            }}
          >
            <option value="rank:asc">Rank</option>
            <option value="period_d:asc">Period, shortest first</option>
            <option value="period_d:desc">Period, longest first</option>
            <option value="depth_ppm:desc">Depth, deepest first</option>
            <option value="snr:desc">SNR, strongest first</option>
          </select>
        </label>
      </div>

      <CsvDownload
        label={`Download these ${rows.length} (CSV)`}
        fileParts={["candidates"]}
        note="Candidate signals, not discoveries."
        rows={() => [
          ["rank", "target", "tic", "classification", "label", "period_d", "duration_d", "depth_ppm", "snr", "bls_power", "n_cadences"],
          ...rows.map((c) => [c.rank, c.target, c.tic, c.classification, c.classification_label, c.period_d, c.duration_d,
            c.depth_ppm, c.snr, c.bls_power, c.n_cadences]),
        ]}
      />

      <ul className="cand-cards" aria-label="Candidate signals">
        {rows.map((c) => (
          <li key={c.slug}>
            <Link href={`/candidates/${c.slug}`} className="cand-card">
              <div className="cand-card-head">
                <div>
                  <span className="cand-card-rank">#{c.rank}</span>
                  <span className="cand-card-title">{c.target}</span>
                </div>
                <ClassificationBadge classification={c.classification} label={labelFor(c)} />
              </div>
              <dl className="cand-card-stats">
                <div>
                  <dt>Period</dt>
                  <dd>{c.period_d.toFixed(4)} d</dd>
                </div>
                <div>
                  <dt>Depth</dt>
                  <dd>{c.depth_ppm.toLocaleString("en-US")} ppm</dd>
                </div>
                <div>
                  <dt>SNR</dt>
                  <dd>{c.snr.toFixed(1)}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="table-wrap">
        <table className="data-table">
          <caption>
            {rows.length} of {candidates.length} {noun(candidates.length, "candidate signal")} shown.
            Select a column header to sort.
          </caption>
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h.key}
                  scope="col"
                  className="sortable"
                  aria-sort={
                    sortKey === h.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button type="button" className="sort-btn" onClick={() => toggleSort(h.key)}>
                    {h.label}
                    {sortKey === h.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th scope="col">Target</th>
              <th scope="col">Classification</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.slug}>
                <td className="num">{c.rank}</td>
                <td className="num">{c.period_d.toFixed(4)}</td>
                <td className="num">{c.depth_ppm.toLocaleString("en-US")}</td>
                <td className="num">{c.snr.toFixed(1)}</td>
                <td>
                  <Link href={`/candidates/${c.slug}`}>{c.target}</Link>
                </td>
                <td>
                  <ClassificationBadge
                    classification={c.classification}
                    label={labelFor(c)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <EmptyState title="No candidate signals match this filter.">
          <p>Choose All to see every target again.</p>
        </EmptyState>
      )}
    </div>
  );
}
