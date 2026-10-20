import type { Metadata } from "next";
import DesignSystemDemo from "@/components/DesignSystemDemo";

export const metadata: Metadata = {
  title: "Design system",
  description: "Colors, type and components used across Planet Hunter.",
  robots: { index: false, follow: false },
};

const SWATCHES = [
  ["--space-950", "Background"],
  ["--space-850", "Surface"],
  ["--space-700", "Raised"],
  ["--line-strong", "Line"],
  ["--ink", "Text"],
  ["--ink-dim", "Text dim"],
  ["--ink-faint", "Text faint"],
  ["--ion", "Ion (accent)"],
  ["--flare", "Flare (caution)"],
  ["--nova", "Nova (warning)"],
  ["--aurora", "Aurora (clean)"],
  ["--dust", "Dust (neutral)"],
] as const;

export default function DesignSystemPage() {
  return (
    <div>
      <p className="eyebrow">Internal</p>
      <h1>Design system</h1>
      <p className="lede">
        The tokens and components every Planet Hunter page is built from. This page is for review
        and testing; it is not linked from the navigation.
      </p>

      <section aria-labelledby="ds-color">
        <h2 id="ds-color">Color</h2>
        <div className="swatches">
          {SWATCHES.map(([token, name]) => (
            <div key={token} className="swatch">
              <div className="swatch-color" style={{ background: `var(${token})` }} />
              <div className="swatch-name">
                {name}
                <br />
                {token}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="ds-type">
        <h2 id="ds-type">Type</h2>
        <p className="type-sample" style={{ fontFamily: "var(--font-display)", fontSize: "var(--step-4)", lineHeight: 1.1 }}>
          Space Grotesk, display
        </p>
        <p className="type-sample">Inter, body text for reading. The quick brown fox jumps over the lazy dog.</p>
        <p className="type-sample mono">JetBrains Mono, data: 16.0509 d · 62,074 cadences · 5,772 K</p>
      </section>

      <DesignSystemDemo />
    </div>
  );
}
