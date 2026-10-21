import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ClassPage from "@/components/classroom/ClassPage";
import { apiGet, type CandidatesResponse } from "@/lib/api";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = { title: "Class",
  description: "Your class, its students and assignments." };
export const dynamic = "force-dynamic";

export default async function ClassRoute({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getFeatures()).classroom) notFound();
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const res = await apiGet<CandidatesResponse>("/api/candidates");
  const candidates = res.ok ? res.data.candidates.map((c) => ({ slug: c.slug, target: c.target })) : [];
  return (
    <div className="page">
      <p><Link href="/classroom" className="back-link">← Your classes</Link></p>
      <ClassPage id={Number(id)} candidates={candidates} />
    </div>
  );
}
