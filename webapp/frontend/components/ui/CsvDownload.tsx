"use client";

import { useState } from "react";
import { csvFileName, toCsv, type Cell } from "@/lib/csv";

/**
 * A button that saves what the page shows as a CSV file. The file is built here in the browser from the same numbers, with
 * a byte order mark so spreadsheets read the symbols (degrees, signs) correctly. It says what it saved.
 */
export default function CsvDownload({ label, fileParts, rows, note }: {
  label: string;
  fileParts: string[];
  rows: () => Cell[][];
  note?: string;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  function save() {
    const body = rows();
    const name = csvFileName(fileParts, new Date());
    const blob = new Blob(["﻿", toCsv(body)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaved(`Saved ${name}: ${Math.max(0, body.length - 1).toLocaleString("en-US")} rows.`);
  }
  return (
    <div className="csv-download">
      <button type="button" className="btn btn--sm" onClick={save} data-testid="csv-button">{label}</button>
      {note && <span className="muted small"> {note}</span>}
      <span className="muted small" role="status" data-testid="csv-saved">{saved ? ` ${saved}` : ""}</span>
    </div>
  );
}
