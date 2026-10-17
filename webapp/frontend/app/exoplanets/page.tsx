import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Exoplanets - Planet Hunter" };

export default function ExoplanetsPage() {
  return (
    <ComingSoon title="Exoplanets" phase={4}>
      Real planetary systems from the NASA Exoplanet Archive in 3D, each star colored by its
      temperature and its habitable zone drawn to scale.
    </ComingSoon>
  );
}
