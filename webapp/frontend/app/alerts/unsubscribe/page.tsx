import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Unsubscribe from "@/components/watch/Unsubscribe";
import { getFeatures } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "Turn off alert emails", robots: { index: false, follow: false } };
}

export const dynamic = "force-dynamic";

export default async function UnsubscribePage() {
  if (!(await getFeatures()).classroom) notFound();
  return (
    <div className="page">
      <p className="eyebrow">Alert emails</p>
      <h1>Turn off alert emails</h1>
      <Unsubscribe />
    </div>
  );
}
