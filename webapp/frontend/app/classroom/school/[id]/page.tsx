import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SchoolAdmin from "@/components/classroom/SchoolAdmin";
import { getFeatures } from "@/lib/features";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id) || !(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "School overview", description: "Teachers, classes and totals for your school or group." };
}
export const dynamic = "force-dynamic";

export default async function SchoolRoute({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getFeatures()).classroom) notFound();
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  return (
    <div className="page">
      <p><Link href="/classroom" className="back-link">← Your classes</Link></p>
      <SchoolAdmin id={Number(id)} />
    </div>
  );
}
