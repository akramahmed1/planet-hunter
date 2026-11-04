import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VerifyEmail from "@/components/classroom/VerifyEmail";
import { getFeatures } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "Confirm your email", robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  if (!(await getFeatures()).classroom) notFound();
  return (
    <div className="page">
      <p className="eyebrow">Teacher account</p>
      <h1>Confirm your email</h1>
      <VerifyEmail />
    </div>
  );
}
