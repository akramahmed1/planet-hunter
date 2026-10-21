import type { Metadata } from "next";
import ErrorState from "@/components/ui/ErrorState";
import SolarSystem from "@/components/solar/SolarSystem";
import { apiV2Get, type BodiesResponse, type OrbitsResponse, type PositionsResponse } from "@/lib/api-v2";
import Tap from "@/components/ui/Tap";

export const metadata: Metadata = { title: "Solar System",
  description: "The planets where they are today, from NASA JPL Horizons, with sources for every number." };
export const dynamic = "force-dynamic";

export default async function SolarSystemPage() {
  const [bodies, positions, orbits] = await Promise.all([
    apiV2Get<BodiesResponse>("/api/v2/bodies"),
    apiV2Get<PositionsResponse>("/api/v2/positions"),
    apiV2Get<OrbitsResponse>("/api/v2/orbits"),
  ]);

  return (
    <div className="page">
      <p className="eyebrow">Real positions from NASA JPL</p>
      <h1>Solar System</h1>
      <p className="lede">
        The Sun, the eight planets and Pluto where they really are on the date you pick. <Tap /> anything to see its
        numbers and where they come from.
      </p>
      {bodies.ok && positions.ok && orbits.ok ? (
        <SolarSystem bodies={bodies.data.bodies} initial={positions.data} orbits={orbits.data} />
      ) : (
        <ErrorState
          title="The solar system data could not be loaded."
          detail={[bodies, positions, orbits].map((r) => (r.ok ? null : r.error)).filter(Boolean).join(", ")}
        >
          <p>Please try again in a minute.</p>
        </ErrorState>
      )}
    </div>
  );
}
