import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Missions - Planet Hunter" };

export default function MissionsPage() {
  return (
    <ComingSoon title="Missions" phase={4}>
      Track the International Space Station live, see how far TESS, JWST and both Voyagers are from
      Earth today, and scroll through how TESS finds planets.
    </ComingSoon>
  );
}
