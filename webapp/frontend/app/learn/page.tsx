import type { Metadata } from "next";
import LessonList from "@/components/learn/LessonList";
import ErrorState from "@/components/ui/ErrorState";
import { apiV2Get, type LessonsResponse } from "@/lib/api-v2";

export const metadata: Metadata = { title: "Learn",
  description: "Short lessons on how astronomers find planets, each with a quiz." };
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const res = await apiV2Get<LessonsResponse>("/api/v2/lessons");
  return (
    <div className="page">
      <p className="eyebrow">Short lessons, real sources</p>
      <h1>Learn</h1>
      <p className="lede">
        Short lessons on planets, space and how planet hunting works. Every fact names its source: tap it to
        see where it comes from. Each lesson ends with a quiz you can retry.
      </p>
      {res.ok ? <LessonList lessons={res.data.lessons} /> : (
        <ErrorState title="The lessons could not be loaded." detail={res.error} />
      )}
    </div>
  );
}
