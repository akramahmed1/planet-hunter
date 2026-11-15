// The footer's first line: which data the page in front of you is built from. Most pages are built on the TESS
// candidate scan; the Solar System and Missions pages show positions and distances from JPL Horizons instead.

export const TESS_CREDIT = "Built from public NASA TESS data, retrieved from MAST. Candidate signals, never discoveries.";
export const HORIZONS_CREDIT = "Positions and distances from NASA JPL Horizons. Tap any value to see its source and when it was fetched.";

export function creditFor(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  if (first === "solar-system" || first === "missions") return HORIZONS_CREDIT;
  return TESS_CREDIT;
}
