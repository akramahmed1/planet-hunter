import type { Metadata } from "next";
import ScanForm from "@/components/scan/ScanForm";

export const metadata: Metadata = { title: "Scan a star",
  description: "Search any TESS star for repeating dips. Results are candidate signals, never discoveries." };

export default function ScanPage() {
  return (
    <div className="page">
      <p className="eyebrow">Run the pipeline yourself</p>
      <h1>Scan a star</h1>
      <p className="lede">
        Pick any star TESS watched. The same pipeline as our hunt downloads its light curve from NASA, searches for
        repeating dips, runs vetting checks and compares the result with what is already known.
      </p>
      <ScanForm />
      <p className="muted">
        Try TOI 700 (a known planet), or TIC 260128333 (a known pair of stars eclipsing each other).
      </p>
    </div>
  );
}
