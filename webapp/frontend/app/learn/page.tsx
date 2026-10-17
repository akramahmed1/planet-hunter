import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Learn - Planet Hunter" };

export default function LearnPage() {
  return (
    <ComingSoon title="Learn" phase={7}>
      Short lessons and quizzes on planets, temperature in space, light travel time, transits and
      how scientists avoid false claims.
    </ComingSoon>
  );
}
