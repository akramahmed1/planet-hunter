import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ResetPassword from "@/components/classroom/ResetPassword";
import { getFeatures } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "Choose a new password", robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

export default async function ResetPage() {
  if (!(await getFeatures()).classroom) notFound();
  return (
    <div className="page">
      <p className="eyebrow">Teacher account</p>
      <h1>Choose a new password</h1>
      <ResetPassword />
    </div>
  );
}
