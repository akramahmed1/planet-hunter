import Badge, { type BadgeTone } from "@/components/ui/Badge";
import type { Classification } from "@/lib/api";
import { CLASSIFICATION_LABELS } from "@/lib/api";

const CLASS_TO_TONE: Record<Classification, BadgeTone> = {
  "clean-recovery": "clean",
  "eclipsing-binary": "eclipsing",
  ambiguous: "ambiguous",
  marginal: "marginal",
  "likely-noise": "noise",
  unreviewed: "unreviewed",
};

export default function ClassificationBadge({
  classification,
  label,
  system,
}: {
  classification: Classification;
  label?: string;
  /** On a system (which may have confirmed planets), say the label describes our pipeline's signal. */
  system?: boolean;
}) {
  if (system) {
    const short = CLASSIFICATION_LABELS[classification].toLowerCase();
    return <Badge tone={CLASS_TO_TONE[classification]}>Our signal: {short}</Badge>;
  }
  return <Badge tone={CLASS_TO_TONE[classification]}>{label || CLASSIFICATION_LABELS[classification]}</Badge>;
}
