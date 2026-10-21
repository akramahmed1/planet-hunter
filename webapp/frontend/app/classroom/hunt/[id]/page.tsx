import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HuntChallenge from "@/components/classroom/HuntChallenge";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = { title: "Hunt challenge",
  description: "Find the repeating dip in a star's light curve for your class." };

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
