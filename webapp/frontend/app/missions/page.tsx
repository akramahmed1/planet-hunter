import type { Metadata } from "next";
import Link from "next/link";
import IssMap from "@/components/missions/IssMap";
import SpacecraftCards from "@/components/missions/SpacecraftCards";
import ErrorState from "@/components/ui/ErrorState";
import { apiV2Get, type MissionsResponse } from "@/lib/api-v2";

export const metadata: Metadata = { title: "Missions - Planet Hunter" };
export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const res = await apiV2Get<MissionsResponse>("/api/v2/missions");
  return (
    <div className="page">
      <p className="eyebrow">Spacecraft, live and far away</p>
      <h1>Missions</h1>
      <p className="lede">
        The space station overhead right now, and how far four robotic explorers are from Earth today.
      </p>
      <IssMap />
      <section aria-labelledby="craft-h">
        <h2 id="craft-h">Far from home</h2>
        <p className="muted">Distances for {res.ok ? res.data.date : "today"} from NASA JPL Horizons.</p>
        {res.ok ? <SpacecraftCards data={res.data} /> : (
          <ErrorState title="Spacecraft distances could not be loaded." detail={res.error} />
        )}
      </section>
      <p>
        <Link href="/missions/tess" className="btn btn--primary">How TESS finds planets</Link>
      </p>
    </div>
  );
}
