"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ClassificationBadge from "@/components/ClassificationBadge";
import { labelFor, type Candidate, type Classification } from "@/lib/api";

type SortKey = "rank" | "period_d" | "depth_ppm" | "snr";

const FILTERS: { value: Classification | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "clean-recovery", label: "Clean recovery" },
  { value: "eclipsing-binary", label: "Eclipsing binary" },
  { value: "ambiguous", label: "Ambiguous" },
  { value: "marginal", label: "Marginal" },
  { value: "likely-noise", label: "Likely noise" },
];

const HEADERS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "Rank" },
  { key: "period_d", label: "Period (d)" },
  { key: "depth_ppm", label: "Depth (ppm)" },
  { key: "snr", label: "SNR" },
];

export default function CandidatesTable({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<Classification | "all">("all");

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

      <div className="table-wrap">
        <table className="data-table">
          <caption className="muted" style={{ padding: "0.75rem 0.9rem" }}>
            {rows.length} of {candidates.length} candidate signals shown.
            Click a column header to sort.
          </caption>
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th key={h.key} scope="col" className="sortable">
                  <button
                    type="button"
                    className="sort-btn"
                    aria-sort={
                      sortKey === h.key
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    onClick={() => toggleSort(h.key)}
                  >
                    {h.label}
                    {sortKey === h.key
                      ? sortDir === "asc"
                        ? " ▲"
                        : " ▼"
                      : ""}
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
        <p className="muted">
          No candidate signals match this filter.
        </p>
      )}
    </div>
  );
}
