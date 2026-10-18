import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ScanResult from "@/components/scan/ScanResult";
import ErrorState from "@/components/ui/ErrorState";
import { apiV2Get, type ScanStatus } from "@/lib/api-v2";

export const metadata: Metadata = { title: "Scan - Planet Hunter" };
export const dynamic = "force-dynamic";

export default async function ScanStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const res = await apiV2Get<ScanStatus>(`/api/v2/scans/${id}`);
  if (!res.ok && (res.status === 404 || res.status === 422)) notFound();
  return (
    <div className="page">
      <p>
        <Link href="/scan" className="back-link">← Scan another star</Link>
      </p>
      {res.ok ? <ScanResult id={Number(id)} initial={res.data} /> : (
        <ErrorState title="This scan could not be loaded." detail={res.error} />
      )}
    </div>
  );
}
