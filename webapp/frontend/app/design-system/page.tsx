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
        <p className="type-sample" style={{ fontFamily: "var(--font-display)", fontSize: "var(--step-4)", lineHeight: "var(--lh-display)", letterSpacing: "var(--tracking-display)" }}>
          Space Grotesk, display
        </p>
        <p className="type-sample">Inter, body text for reading. The quick brown fox jumps over the lazy dog.</p>
        <p className="type-sample mono">JetBrains Mono, data: 16.0509 d · 62,074 cadences · 5,772 K</p>
      </section>

      <section aria-labelledby="ds-surfaces">
        <h2 id="ds-surfaces">Surfaces and depth</h2>
        <p className="muted">
          Panels are translucent glass with a thin glow edge. Depth has three steps. The fill never drops below 0.82
          opacity, so text contrast does not depend on what sits behind a panel. With reduced transparency or no blur
          support the panels turn solid in the same colour.
        </p>
        <div className="depth-row" data-testid="depth-row">
          {[["--depth-1", "Resting"], ["--depth-2", "Raised"], ["--depth-3", "Floating"]].map(([token, name]) => (
            <div key={token} className="depth-sample" style={{ boxShadow: `var(${token}), var(--glow-edge)` }}>
              <strong>{name}</strong>
              <span className="muted small">{token}</span>
            </div>
          ))}
        </div>
        <div className="card card--glow" data-testid="glass-sample">
          <p className="eyebrow">Glow edge</p>
          <h3 className="card-title">A raised panel</h3>
          <p>Use the glow edge for the one panel on a page that should draw the eye, and the quiet edge for the rest.</p>
        </div>
      </section>

      <DesignSystemDemo />
    </div>
  );
}
