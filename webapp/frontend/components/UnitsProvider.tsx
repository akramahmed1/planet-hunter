"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DISTANCE_UNITS, TEMP_UNITS, type DistanceUnit, type TempUnit } from "@/lib/units";

export type UnitsPreference = { temp: TempUnit; distance: DistanceUnit };

export const DEFAULT_UNITS: UnitsPreference = { temp: "F", distance: "mi" };
export const UNITS_STORAGE_KEY = "ph.units.v1";

type UnitsContextValue = UnitsPreference & {
  setTemp: (u: TempUnit) => void;
  setDistance: (u: DistanceUnit) => void;
};

const UnitsContext = createContext<UnitsContextValue | null>(null);

// localStorage can be missing or throw (private mode, blocked storage), so
// every access is guarded and the defaults always work without it.
function readStored(): UnitsPreference {
  try {
    const raw = window.localStorage.getItem(UNITS_STORAGE_KEY);
    if (!raw) return DEFAULT_UNITS;
    const parsed = JSON.parse(raw) as Partial<UnitsPreference>;
    return {
      temp: TEMP_UNITS.includes(parsed.temp as TempUnit) ? (parsed.temp as TempUnit) : DEFAULT_UNITS.temp,
      distance: DISTANCE_UNITS.includes(parsed.distance as DistanceUnit)
        ? (parsed.distance as DistanceUnit)
        : DEFAULT_UNITS.distance,
    };
  } catch {
    return DEFAULT_UNITS;
  }
}

function writeStored(pref: UnitsPreference) {
  try {
    window.localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
}

export default function UnitsProvider({ children }: { children: ReactNode }) {
  // Server render and first client render both use the defaults, so
  // hydration matches; the stored choice is applied right after mount.
  const [pref, setPref] = useState<UnitsPreference>(DEFAULT_UNITS);

  useEffect(() => {
    setPref(readStored());
  }, []);

  const update = useCallback((next: Partial<UnitsPreference>) => {
    setPref((prev) => {
      const merged = { ...prev, ...next };
      writeStored(merged);
      return merged;
    });
  }, []);

  const value = useMemo<UnitsContextValue>(
    () => ({
      ...pref,
      setTemp: (temp) => update({ temp }),
      setDistance: (distance) => update({ distance }),
    }),
    [pref, update],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used inside <UnitsProvider>");
  return ctx;
}
