"use client";

import { useState } from "react";
import { useUnits } from "@/components/UnitsProvider";
import Sheet from "@/components/ui/Sheet";
import Toggle from "@/components/ui/Toggle";
import { DISTANCE_LABELS, TEMP_LABELS, type DistanceUnit, type TempUnit } from "@/lib/units";

const TEMP_OPTIONS: { value: TempUnit; label: string; title: string }[] = [
  { value: "F", label: TEMP_LABELS.F, title: "°F, Fahrenheit" },
  { value: "C", label: TEMP_LABELS.C, title: "°C, Celsius" },
  { value: "K", label: TEMP_LABELS.K, title: "K, Kelvin" },
];

const DISTANCE_OPTIONS: { value: DistanceUnit; label: string; title: string }[] = [
  { value: "mi", label: DISTANCE_LABELS.mi, title: "mi, miles" },
  { value: "km", label: DISTANCE_LABELS.km, title: "km, kilometers" },
  { value: "au", label: DISTANCE_LABELS.au, title: "AU, astronomical units" },
];

export function UnitsToggles() {
  const { temp, distance, setTemp, setDistance } = useUnits();
  return (
    <>
      <Toggle legend="Temperature" options={TEMP_OPTIONS} value={temp} onChange={setTemp} />
      <Toggle legend="Distance" options={DISTANCE_OPTIONS} value={distance} onChange={setDistance} />
      <p className="muted">
        1 AU is the average distance from Earth to the Sun, about 93 million miles. Your choice is
        saved on this device.
      </p>
    </>
  );
}

/** The units button in the top bar, opening a sheet with the unit toggles. */
export default function UnitsButton() {
  const [open, setOpen] = useState(false);
  const { temp, distance } = useUnits();
  return (
    <>
      <button
        type="button"
        className="btn btn--sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid="units-button"
      >
        <span className="sr-only">Units: </span>
        <span className="mono">
          {TEMP_LABELS[temp]} · {DISTANCE_LABELS[distance]}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Units">
        <UnitsToggles />
      </Sheet>
    </>
  );
}
