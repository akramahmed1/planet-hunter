import type { Metadata } from "next";
import Link from "next/link";
import ClassificationBadge from "@/components/ClassificationBadge";
import ErrorState from "@/components/ui/ErrorState";
import type { Classification } from "@/lib/api";
import { apiV2Get, type TargetsResponse } from "@/lib/api-v2";
import { parsecsToLightYears } from "@/lib/sky";

export const metadata: Metadata = { title: "Exoplanets - Planet Hunter" };
export const dynamic = "force-dynamic";

export default async function ExoplanetsPage() {
  const res = await apiV2Get<TargetsResponse>("/api/v2/targets");
  return (
    <div className="page">
      <p className="eyebrow">Real systems from the NASA Exoplanet Archive</p>
      <h1>Exoplanets</h1>
      <p className="lede">
        The eight stars our pipeline searched. Open one to see its confirmed planets, where our signal would orbit,
        and the zone where liquid water could exist.
      </p>
      {res.ok ? (
        <ul className="cand-cards system-list" data-testid="target-list">
          {res.data.targets.map((t) => (
            <li key={t.slug} className="cand-card">
              <div className="cand-card-head">
                <Link href={`/exoplanets/${t.slug}`} className="cand-card-title">
                  {t.target}
                </Link>
                <ClassificationBadge classification={t.classification as Classification} system />
              </div>
              <p className="muted">
                {t.confirmed_planets === 0
                  ? "No confirmed planets in the archive"
                  : `${t.confirmed_planets} confirmed planet${t.confirmed_planets === 1 ? "" : "s"}`}
                {t.distance_pc != null && ` · ${Math.round(parsecsToLightYears(t.distance_pc))} light years away`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <ErrorState title="The list of systems could not be loaded." detail={res.error} />
      )}
    </div>
  );
}
