import Skeleton from "@/components/ui/Skeleton";

const TITLES = ["ISS right now", "Picture of the day", "Confirmed exoplanets", "Space weather"];

export default function TilesSkeleton() {
  return (
    <div className="tile-grid" aria-busy="true" aria-label="Loading live data">
      {TITLES.map((t) => (
        <article key={t} className="tile">
          <p className="eyebrow">{t}</p>
          <Skeleton width="70%" height="1.6rem" />
          <div style={{ height: 10 }} />
          <Skeleton width="90%" height="0.85rem" />
        </article>
      ))}
    </div>
  );
}
