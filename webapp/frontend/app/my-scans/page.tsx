import type { Metadata } from "next";
import MyScans from "@/components/scan/MyScans";

export const metadata: Metadata = { title: "My saved scans", robots: { index: false },
  description: "Scans you saved, for signed-in teachers and students." };

export default function MyScansPage() {
  return (
    <div className="page">
      <p className="eyebrow">Your list</p>
      <h1>My saved scans</h1>
      <p className="lede">The scans you chose to keep, newest first. Only you can see this list.</p>
      <MyScans />
    </div>
  );
}
