import type { Metadata } from "next";
import ClassroomHome from "@/components/classroom/ClassroomHome";

export const metadata: Metadata = { title: "Classroom",
  description: "Teachers set planet-hunting assignments and students join with a class code." };

export default function ClassroomPage() {
  return (
    <div className="page">
      <p className="eyebrow">For teachers and students</p>
      <h1>Classroom</h1>
      <p className="lede">
        Teachers make classes and assign lessons, quizzes and hunt challenges. Students aged 13 and up join with a
        class code, a nickname and a PIN, with no email.
      </p>
      <ClassroomHome />
    </div>
  );
}
