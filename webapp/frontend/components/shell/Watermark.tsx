/**
 * The brand mark (the ringed planet from the site icon) as a very faint, slowly tilting shape in the corner behind
 * every page. Purely decoration: hidden from screen readers, never takes a tap, and switched off in CSS for people who
 * ask for less motion, in high contrast mode and when printing.
 */
export default function Watermark() {
  return (
    <div className="watermark" aria-hidden="true" data-testid="watermark">
      <svg viewBox="0 0 64 64" focusable="false">
        <g className="watermark-tilt" fill="none" strokeLinecap="round">
          <path d="M5 32a27 9 0 0 1 54 0" stroke="currentColor" strokeWidth="3" opacity="0.5" />
          <circle cx="32" cy="32" r="13" fill="currentColor" stroke="none" />
          <path d="M5 32a27 9 0 0 0 54 0" stroke="currentColor" strokeWidth="3" />
        </g>
      </svg>
    </div>
  );
}
