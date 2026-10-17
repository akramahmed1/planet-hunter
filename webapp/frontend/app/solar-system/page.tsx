import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Solar System - Planet Hunter" };

export default function SolarSystemPage() {
  return (
    <ComingSoon title="Solar System" phase={3}>
      Fly through the Sun, the eight planets and Pluto at their real positions for any date, with
      temperatures and distances in your units.
    </ComingSoon>
  );
}
