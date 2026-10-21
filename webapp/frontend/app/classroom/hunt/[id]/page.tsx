import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HuntChallenge from "@/components/classroom/HuntChallenge";
import { getFeatures } from "@/lib/features";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id) || !(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "Hunt challenge", description: "Find the repeating dip in a star's light curve for your class." };
}

export const dynamic = "force-dynamic";

export default async function HuntRoute({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getFeatures()).classroom) notFound();
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  return (
    <div className="page">
      <HuntChallenge id={Number(id)} />
    </div>
  );
}
