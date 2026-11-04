import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, csvFileName, shareUrl, toCsv } from "./csv.ts";

describe("csv", () => {
  it("writes plain values as they are and leaves gaps for missing ones", () => {
    assert.equal(csvCell("TOI 700"), "TOI 700");
    assert.equal(csvCell(16.0503), "16.0503");
    assert.equal(csvCell(-3.5), "-3.5"); // a negative number is a number, not a formula
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(NaN), "");
    assert.equal(csvCell(Infinity), "");
    assert.equal(csvCell(true), "true");
  });

  it("quotes commas, quotes and line breaks, and doubles inner quotes", () => {
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("two\nlines"), '"two\nlines"');
    assert.equal(csvCell(" padded "), '" padded "');
  });

  it("defangs text a spreadsheet would run as a formula", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"]) {
      assert.ok(csvCell(bad).replace(/^"/, "").startsWith("'"), `${JSON.stringify(bad)} -> ${csvCell(bad)}`);
    }
    assert.equal(csvCell("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvCell("a=b"), "a=b"); // only a leading character matters
  });

  it("joins rows with CRLF and ends with one", () => {
    assert.equal(toCsv([["a", "b"], [1, null]]), "a,b\r\n1,\r\n");
    assert.equal(toCsv([]), "\r\n");
  });

  it("names the file safely, with the date", () => {
    const d = new Date("2026-10-22T12:00:00Z");
    assert.equal(csvFileName(["Candidates"], d), "planet-hunter-candidates-2026-10-22.csv");
    assert.equal(csvFileName(["TOI 700", "light curve"], d), "planet-hunter-toi-700-light-curve-2026-10-22.csv");
    assert.equal(csvFileName(["../../etc/passwd"], d), "planet-hunter-etc-passwd-2026-10-22.csv");
    assert.equal(csvFileName([""], d), "planet-hunter-data-2026-10-22.csv");
  });

  it("builds a share link from the site address and a path, with nothing else on it", () => {
    assert.equal(shareUrl("https://example.org", "/candidates/toi-700"), "https://example.org/candidates/toi-700");
    assert.equal(shareUrl("https://example.org/", "candidates/toi-700"), "https://example.org/candidates/toi-700");
  });
});
