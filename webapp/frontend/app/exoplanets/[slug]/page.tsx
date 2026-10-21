import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ExplainBox from "@/components/explain/ExplainBox";
import SystemView from "@/components/exo/SystemView";
import SkyPanel from "@/components/sky/SkyPanel";
import ErrorState from "@/components/ui/ErrorState";
import { apiV2Get, type TargetSystem } from "@/lib/api-v2";
import Tap from "@/components/ui/Tap";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.toUpperCase().replace("-", " ");
  return {
    title: `${name} system`,
    description: `${name}: its confirmed planets, its habitable zone, and where our pipeline's signal would orbit.`,
  };
}

export default async function SystemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await apiV2Get<TargetSystem>(`/api/v2/targets/${encodeURIComponent(slug)}/system`);
  if (!res.ok && (res.status === 404 || res.status === 422)) notFound();
  return (
    <div className="page">
      <p>
        <Link href="/exoplanets" className="back-link">← All systems</Link>
      </p>
      {res.ok ? (
        <>
          <p className="eyebrow">{res.data.tic}</p>
          <h1>{res.data.target} system</h1>
          <p className="lede">
            Confirmed planets from the NASA Exoplanet Archive, plus where our pipeline&apos;s signal would orbit. <Tap />
            the star or a planet for its numbers.
          </p>
          <SystemView system={res.data} />
          <ExplainBox kind="planet" refId={slug} />
          <p>
            <Link href={`/candidates/${slug}`}>See our pipeline&apos;s result for {res.data.target}</Link>
          </p>
          {res.data.star.ra_deg != null && res.data.star.dec_deg != null && (
            <SkyPanel name={res.data.target} ra={res.data.star.ra_deg} dec={res.data.star.dec_deg}
              source={res.data.star_source} />
          )}
        </>
      ) : (
        <ErrorState title="This system could not be loaded." detail={res.error} />
      )}
    </div>
  );
}
