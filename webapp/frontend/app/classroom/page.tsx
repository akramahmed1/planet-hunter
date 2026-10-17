import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Classroom - Planet Hunter" };

export default function ClassroomPage() {
  return (
    <ComingSoon title="Classroom" phase={8}>
      Classes, assignments and a gradebook for teachers. Students aged 13 and up join with a class
      code, a nickname and a PIN.
    </ComingSoon>
  );
}
