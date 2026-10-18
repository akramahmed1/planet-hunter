import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HuntChallenge from "@/components/classroom/HuntChallenge";

export const metadata: Metadata = { title: "Hunt challenge - Planet Hunter" };

export default async function HuntRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  return (
    <div className="page">
      <HuntChallenge id={Number(id)} />
    </div>
  );
}
