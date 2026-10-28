import LocalTime from "@/components/LocalTime";
import RetryButton from "./RetryButton";
import { headline, STATE_WORDS, type SourceStatus } from "@/lib/status";

/** Mission control at a glance: is each live source answering, and when did it last update? Honest about problems. */
export default function MissionStatus({ items }: { items: SourceStatus[] }) {
  return (
    <div className="mission" data-testid="mission-status">
      <p className="mission-head" role="status" data-testid="mission-headline">{headline(items)}</p>
      <ul className="mission-list">
        {items.map((i) => (
          <li key={i.name} className={`mission-item mission-item--${i.state}`} data-testid="mission-item">
            <span className="mission-dot" aria-hidden="true" />
            <span className="mission-name">{i.name}</span>
            <span className="mission-state" data-testid="mission-state">{STATE_WORDS[i.state]}</span>
            {i.fetchedAt && i.state !== "down" && (
              <span className="muted small"> updated <LocalTime iso={i.fetchedAt} /></span>
            )}
          </li>
        ))}
      </ul>
      {items.some((i) => i.state !== "live") && (
        <p className="muted small" data-testid="mission-help">
          A source that does not answer shows as Unavailable. When we have an earlier good copy we show it and mark it
          &ldquo;May be out of date&rdquo;. <RetryButton />
        </p>
      )}
    </div>
  );
}
