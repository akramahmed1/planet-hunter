import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LessonPlayer from "@/components/learn/LessonPlayer";
import ErrorState from "@/components/ui/ErrorState";
import { apiV2Get, type LessonResponse } from "@/lib/api-v2";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function getLesson(slug: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  return apiV2Get<LessonResponse>(`/api/v2/lessons/${slug}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const res = await getLesson((await params).slug);
  return { title: `${res?.ok ? res.data.title : "Lesson"} - Planet Hunter` };
}

export default async function LessonPage({ params }: Props) {
  const res = await getLesson((await params).slug);
  if (res === null || (!res.ok && (res.status === 404 || res.status === 422))) notFound();
  return (
    <div className="page">
      <p>
        <Link href="/learn" className="back-link">← All lessons</Link>
      </p>
      {res.ok ? (
        <>
          <p className="eyebrow">{res.data.minutes} min lesson</p>
          <h1>{res.data.title}</h1>
          <p className="lede">{res.data.summary}</p>
          <LessonPlayer lesson={res.data} />
        </>
      ) : (
        <ErrorState title="This lesson could not be loaded." detail={res.error} />
      )}
    </div>
  );
}
