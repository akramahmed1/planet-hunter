import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Doors from "@/components/welcome/Doors";
import { getFeatures } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "Choose your way in", description: "Explore Planet Hunter as a guest, or sign in as a teacher or a student." };
}

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (!(await getFeatures()).classroom) notFound();
  return (
    <div className="page">
      <p className="eyebrow">Welcome</p>
      <h1>Choose your way in</h1>
      <p className="lede">
        Everything except the Classroom works without an account. Pick the door that fits. You can change your mind at
        any time, and your choice only changes what we show you here, never what you are allowed to do.
      </p>
      <Doors />
    </div>
  );
}
