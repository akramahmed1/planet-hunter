import type { IconName } from "./nav";

// Simple line icons drawn for this app (24px grid, 1.6 stroke).
const PATHS: Record<IconName, React.ReactNode> = {
  explore: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  solar: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" />
      <circle cx="20.2" cy="10.3" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  exoplanets: (
    <>
      <circle cx="9" cy="10" r="5" />
      <path d="M3 14.5c3.5 1.5 9.5 1 13.5-1.5" />
      <circle cx="18.5" cy="6" r="1.5" />
      <path d="M17 18.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </>
  ),
  hunt: (
    <>
      <path d="M3 9h3.5l1.5 4 1.5-4H21" />
      <path d="M3 16h18" opacity="0.5" />
      <circle cx="8" cy="5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  missions: (
    <>
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9.5 12H3.5M20.5 12h-6M12 9.5V5M5 9v6M19 9v6" />
    </>
  ),
  learn: (
    <>
      <path d="M3 8l9-4 9 4-9 4z" />
      <path d="M7 10v5c2.5 2 7.5 2 10 0v-5" />
    </>
  ),
  method: (
    <>
      <path d="M4 6h16M4 12h10M4 18h6" />
      <circle cx="18" cy="16" r="3" />
      <path d="M20.2 18.2L22 20" />
    </>
  ),
  classroom: (
    <>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.4" />
      <path d="M3 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6M13.5 18.5c.4-2.2 1.6-3.4 3-3.4 1.6 0 3 1.3 3.5 3.4" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
};

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ph-star" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.55" stopColor="#ffc56b" />
          <stop offset="1" stopColor="#ff8f5e" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="6.5" fill="url(#ph-star)" />
      <circle cx="16.4" cy="13.2" r="2.3" fill="#070b17" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3.4" fill="none" stroke="#7cc4ff" strokeWidth="1" opacity="0.8" transform="rotate(-18 12 12)" />
    </svg>
  );
}
