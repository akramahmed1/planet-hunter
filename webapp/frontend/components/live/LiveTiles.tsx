import { apiV2Get, type Apod, type ExoplanetsLatest, type Iss, type SpaceWeather } from "@/lib/api-v2";
import ApodImage from "./ApodImage";
import IssTile from "./IssTile";
import { formatUtc } from "@/lib/time";
import SourceButton from "./SourceButton";

function Unavailable({ id, title, message }: { id: string; title: string; message: string }) {
  return (
    <article className="tile tile--down" aria-labelledby={id}>
      <p className="eyebrow" id={id}>
        {title}
      </p>
      <p className="tile-sub">{message}</p>
      <p className="tile-meta">
        <span className="stale-tag">Unavailable</span>
      </p>
    </article>
  );
}

function Meta({ fetchedAt, stale }: { fetchedAt: string; stale: boolean }) {
  return (
    <p className="tile-meta">
      Updated <time dateTime={fetchedAt}>{formatUtc(fetchedAt)}</time>
      {stale && <span className="stale-tag">May be out of date</span>}
    </p>
  );
}

/** "Live from space" tiles on the Explore page. Each value opens its source. */
export default async function LiveTiles() {
  const [iss, apod, exo, weather] = await Promise.all([
    apiV2Get<Iss>("/api/v2/iss"),
    apiV2Get<Apod>("/api/v2/apod"),
    apiV2Get<ExoplanetsLatest>("/api/v2/exoplanets/latest"),
    apiV2Get<SpaceWeather>("/api/v2/space-weather"),
  ]);

  return (
    <div className="tile-grid">
      <IssTile initial={iss.ok ? iss.data : null} />

      {apod.ok ? (
        <article className="tile tile--apod" aria-labelledby="tile-apod">
          <p className="eyebrow" id="tile-apod">
            Picture of the day
          </p>
          {apod.data.media_type === "image" && apod.data.url && (
            <ApodImage src={apod.data.url} alt={apod.data.title} />
          )}
          <SourceButton label="Picture of the day" source={apod.data.source} kind="measured"
            fetchedAt={apod.data.fetched_at} stale={apod.data.stale}>
            <span className="tile-value tile-value--text">{apod.data.title}</span>
          </SourceButton>
          <p className="tile-sub">
            {apod.data.copyright ? `Image credit: ${apod.data.copyright}` : "Public domain (no copyright listed)"} ·{" "}
            <span className="nowrap">{apod.data.date}</span>
          </p>
          <Meta fetchedAt={apod.data.fetched_at} stale={apod.data.stale} />
        </article>
      ) : (
        <Unavailable id="tile-apod" title="Picture of the day"
          message={apod.unavailable?.message ?? "NASA's picture of the day is unavailable right now."} />
      )}

      {exo.ok ? (
        <article className="tile" aria-labelledby="tile-exo">
          <p className="eyebrow" id="tile-exo">
            Confirmed exoplanets
          </p>
          <SourceButton label="Confirmed exoplanets" source={exo.data.confirmed_count.source}
            kind={exo.data.confirmed_count.kind} fetchedAt={exo.data.fetched_at} stale={exo.data.stale}
            note={exo.data.confirmed_count.note}>
            <span className="tile-value mono">{exo.data.confirmed_count.value.toLocaleString("en-US")}</span>
          </SourceButton>
          <p className="tile-sub">
            {exo.data.latest.length > 0
              ? `Newest: ${exo.data.latest.slice(0, 3).map((p) => p.name).join(", ")}`
              : `None published since ${exo.data.since}.`}
          </p>
          <Meta fetchedAt={exo.data.fetched_at} stale={exo.data.stale} />
        </article>
      ) : (
        <Unavailable id="tile-exo" title="Confirmed exoplanets"
          message={exo.unavailable?.message ?? "The exoplanet count is unavailable right now."} />
      )}

      {weather.ok ? (
        <article className="tile" aria-labelledby="tile-weather">
          <p className="eyebrow" id="tile-weather">
            Space weather
          </p>
          <SourceButton label="Space weather" source={weather.data.source} kind="measured"
            fetchedAt={weather.data.fetched_at} stale={weather.data.stale}>
            <span className="tile-value mono">{weather.data.notifications.length}</span>
          </SourceButton>
          <p className="tile-sub">
            {weather.data.notifications.length === 1 ? "notice" : "notices"} from NASA in the last{" "}
            {weather.data.window_days} days
            {weather.data.notifications[0] ? `, latest: ${weather.data.notifications[0].type}` : ""}
          </p>
          <Meta fetchedAt={weather.data.fetched_at} stale={weather.data.stale} />
        </article>
      ) : (
        <Unavailable id="tile-weather" title="Space weather"
          message={weather.unavailable?.message ?? "Space weather notices are unavailable right now."} />
      )}
    </div>
  );
}
