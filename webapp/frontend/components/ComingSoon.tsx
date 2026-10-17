import { ButtonLink } from "@/components/ui/Button";

/** Placeholder for a section that is planned but not built yet. */
export default function ComingSoon({
  title,
  phase,
  children,
}: {
  title: string;
  phase: number;
  children: React.ReactNode;
}) {
  return (
    <div className="soon">
      <svg className="soon-orbit" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle cx="60" cy="60" r="10" fill="#ffc56b" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 5" />
        <g className="orbit-planet">
          <circle cx="104" cy="60" r="5" fill="currentColor" />
        </g>
      </svg>
      <p className="eyebrow">Coming soon</p>
      <h1>{title}</h1>
      <p className="lede">{children}</p>
      <p className="muted">Planned for build phase {phase}. This page is a placeholder so links never break.</p>
      <div className="btn-row">
        <ButtonLink href="/candidates" variant="primary">
          Explore the candidates
        </ButtonLink>
        <ButtonLink href="/">Back to Explore</ButtonLink>
      </div>
    </div>
  );
}
