import type { Classification } from "@/lib/api";
import { CLASSIFICATION_LABELS } from "@/lib/api";

const CLASS_TO_BADGE: Record<Classification, string> = {
  "clean-recovery": "badge badge-clean",
  "eclipsing-binary": "badge badge-eclipsing",
  ambiguous: "badge badge-ambiguous",
  marginal: "badge badge-marginal",
  "likely-noise": "badge badge-noise",
  unreviewed: "badge badge-unreviewed",
};

export default function ClassificationBadge({
  classification,
  label,
}: {
  classification: Classification;
  label?: string;
}) {
  return (
    <span className={CLASS_TO_BADGE[classification]}>
      {label || CLASSIFICATION_LABELS[classification]}
    </span>
  );
}
