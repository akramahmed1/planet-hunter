import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClassroomHome from "@/components/classroom/ClassroomHome";
import { getFeatures } from "@/lib/features";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await getFeatures()).classroom) return { title: "Page not found" };
  return { title: "Classroom", description: "Teachers set planet-hunting assignments and students join with a class code." };
}

export const dynamic = "force-dynamic";

export default async function ClassroomPage({ searchParams }: { searchParams: Promise<{ as?: string | string[] }> }) {
  if (!(await getFeatures()).classroom) notFound();
  const as = (await searchParams).as;
  const who = as === "teacher" || as === "student" ? as : undefined;
  return (
    <div className="page">
      <p className="eyebrow">For teachers and students</p>
      <h1>Classroom</h1>
      <p className="lede">
        Teachers make classes and assign lessons, quizzes and hunt challenges. Students aged 13 and up join with a
        class code, a nickname and a PIN, with no email.
      </p>
      <ClassroomHome who={who} />
    </div>
  );
}
