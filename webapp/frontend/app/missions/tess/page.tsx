import type { Metadata } from "next";
import Link from "next/link";
import TessExplainer from "@/components/tess/TessExplainer";
import ErrorState from "@/components/ui/ErrorState";
import { apiGet, type OverviewResponse } from "@/lib/api";
import { apiV2Get, type BodiesResponse, type TessFacts } from "@/lib/api-v2";

export const metadata: Metadata = { title: "How TESS works - Planet Hunter" };
export const dynamic = "force-dynamic";

export default async function TessPage() {
  const [facts, bodies, overview] = await Promise.all([
    apiV2Get<TessFacts>("/api/v2/tess"),
    apiV2Get<BodiesResponse>("/api/v2/bodies"),
    apiGet<OverviewResponse>("/api/overview"),
  ]);
  const moon = bodies.ok ? bodies.data.bodies.find((b) => b.id === "moon")?.semimajor_axis : null;
  const v = overview.ok ? overview.data.validation : null;
  return (
    <div className="page">
      <p>
        <Link href="/missions" className="back-link">← Missions</Link>
      </p>
      <p className="eyebrow">The telescope behind our data</p>
      <h1>How TESS finds planets</h1>
      {facts.ok && moon && v ? (
        <TessExplainer facts={facts.data.facts} moonKm={moon.value * 1e6} depthPpm={v.depth_ppm} target={v.target} />
      ) : (
        <ErrorState title="This page's facts could not be loaded."
          detail={[facts, bodies, overview].map((r) => (r.ok ? null : r.error)).filter(Boolean).join(", ")} />
      )}
    </div>
  );
}
