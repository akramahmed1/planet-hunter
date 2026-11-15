// Tour stops, Sun to Neptune: one fact and one optional quiz question each.
//
// Every number comes from the NSSDCA fact sheets served by /api/v2/bodies;
// nothing is typed in by hand. Quiz answers are worked out from the same data,
// and lib/tour.test.ts checks each one against it.
import { formatDuration, formatPeriodDays, type SceneBodyId } from "./solar.ts";
import { C_KM_PER_S, formatLightTime } from "./units.ts";

/** The parts of an API body the tour reads (a subset of Schemas["Body"]). */
export type TourBody = {
  id: string;
  name: string;
  source: { name: string; url: string };
  mass: { value: number } | null;
  semimajor_axis: { value: number } | null;
  orbit_period: { value: number } | null;
  day_length: { value: number } | null;
  temperatures: { label: string; value: { kelvin: number } | null }[];
};

export type Quiz = { question: string; options: string[]; answer: number; explain: string };

export type TourStop = {
  id: SceneBodyId;
  title: string;
  fact: string;
  kind: "measured" | "computed";
  source: { name: string; url: string };
  quiz: Quiz;
};

export const TOUR_ORDER: readonly SceneBodyId[] = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
];

type Bodies = Record<string, TourBody>;

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`tour: missing ${what}`);
  return v;
}

function tempK(b: TourBody, label: string): number {
  const t = b.temperatures.find((x) => x.label === label);
  return need(t?.value?.kelvin, `${b.id} ${label}`);
}

const fmt = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Light time from the Sun at the average orbital distance (semimajor axis in 10^6 km). */
function sunlightSeconds(b: TourBody): number {
  return (need(b.semimajor_axis, `${b.id} semimajor axis`).value * 1e6) / C_KM_PER_S;
}

/** Index of the option closest to `value` (options are numbers, shown as text). */
function closest(options: number[], value: number): number {
  let best = 0;
  options.forEach((o, i) => {
    if (Math.abs(o - value) < Math.abs(options[best] - value)) best = i;
  });
  return best;
}

export function buildTour(bodies: Bodies): TourStop[] {
  const b = (id: string) => need(bodies[id], id);
  const stop = (id: SceneBodyId, s: Omit<TourStop, "id" | "title" | "source">): TourStop => ({
    id,
    title: b(id).name,
    source: b(id).source,
    ...s,
  });

  const sun = b("sun");
  const core = tempK(sun, "Central temperature");
  const surface = tempK(sun, "Effective temperature");

  const mercury = b("mercury");
  const mDay = need(mercury.day_length, "mercury day").value;
  const mYearDays = need(mercury.orbit_period, "mercury year").value;

  const venus = b("venus");
  const vTemp = tempK(venus, "Average temperature");
  const mTemp = tempK(mercury, "Average temperature");

  const earth = b("earth");
  const eLight = sunlightSeconds(earth);

  const mars = b("mars");
  const marsDay = need(mars.day_length, "mars day").value;
  const earthDay = need(earth.day_length, "earth day").value;

  const jupiter = b("jupiter");
  const jRatio = need(jupiter.mass, "jupiter mass").value / need(earth.mass, "earth mass").value;
  const jOptions = [3, 32, 318, 3180];

  const saturn = b("saturn");
  const sYears = need(saturn.orbit_period, "saturn year").value / need(earth.orbit_period, "earth year").value;
  const sOptions = [3, 12, 29, 84];

  const uranus = b("uranus");
  const uYears = need(uranus.orbit_period, "uranus year").value / need(earth.orbit_period, "earth year").value;
  const uOptions = [12, 29, 84, 165];

  const neptune = b("neptune");
  const nLightH = sunlightSeconds(neptune) / 3600;
  const nOptions = [0.5, 4, 40];

  return [
    stop("sun", {
      fact: `The Sun's visible surface is about ${fmt(surface)} K. Its core is far hotter: about ${fmt(core / 1e6, 1)} million K.`,
      kind: "measured",
      quiz: {
        question: "Which part of the Sun is hotter?",
        options: ["The surface", "The core"],
        answer: core > surface ? 1 : 0,
        explain: `The core is about ${fmt(core / surface)} times hotter than the surface, measured in kelvin.`,
      },
    }),
    stop("mercury", {
      fact: `One day on Mercury, sunrise to sunrise, lasts ${formatDuration(mDay)}. Its year is only ${formatPeriodDays(mYearDays)}.`,
      kind: "measured",
      quiz: {
        question: "On Mercury, which is longer: one day or one year?",
        options: ["One day", "One year"],
        answer: mDay / 24 > mYearDays ? 0 : 1,
        explain: "Mercury spins so slowly that one sunrise to the next takes about two of its years.",
      },
    }),
    stop("venus", {
      fact: `Venus averages ${fmt(vTemp)} K, hotter than Mercury (${fmt(mTemp)} K) even though Venus is farther from the Sun. Its thick carbon dioxide air traps heat.`,
      kind: "measured",
      quiz: {
        question: "Which planet is hotter on average?",
        options: ["Mercury", "Venus"],
        answer: vTemp > mTemp ? 1 : 0,
        explain: `Venus averages ${fmt(vTemp)} K and Mercury ${fmt(mTemp)} K.`,
      },
    }),
    stop("earth", {
      fact: `Sunlight takes about ${formatLightTime(eLight)} to cross the average distance to Earth.`,
      kind: "computed",
      quiz: {
        question: "About how long does sunlight take to reach Earth?",
        options: ["8 seconds", "8 minutes", "8 hours"],
        answer: closest([8, 8 * 60, 8 * 3600], eLight),
        explain: `Average distance divided by the speed of light: ${formatLightTime(eLight)}.`,
      },
    }),
    stop("mars", {
      fact: `A day on Mars lasts ${formatDuration(marsDay)}, close to Earth's ${formatDuration(earthDay)}.`,
      kind: "measured",
      quiz: {
        question: "Is a day on Mars longer or shorter than a day on Earth?",
        options: ["Longer", "Shorter"],
        answer: marsDay > earthDay ? 0 : 1,
        explain: `Mars: ${formatDuration(marsDay)}. Earth: ${formatDuration(earthDay)}.`,
      },
    }),
    stop("jupiter", {
      fact: `Jupiter has about ${fmt(jRatio)} times the mass of Earth.`,
      kind: "computed",
      quiz: {
        question: "About how many Earths would it take to match Jupiter's mass?",
        options: jOptions.map((n) => fmt(n)),
        answer: closest(jOptions, jRatio),
        explain: `Jupiter's mass divided by Earth's mass is about ${fmt(jRatio)}.`,
      },
    }),
    stop("saturn", {
      fact: `Saturn takes about ${fmt(sYears, 1)} Earth years to go once around the Sun.`,
      kind: "computed",
      quiz: {
        question: "About how many Earth years is one year on Saturn?",
        options: sOptions.map((n) => fmt(n)),
        answer: closest(sOptions, sYears),
        explain: `Saturn's orbit period divided by Earth's is about ${fmt(sYears, 1)}.`,
      },
    }),
    stop("uranus", {
      fact: `Uranus takes about ${fmt(uYears)} Earth years to go once around the Sun.`,
      kind: "computed",
      quiz: {
        question: "About how many Earth years is one year on Uranus?",
        options: uOptions.map((n) => fmt(n)),
        answer: closest(uOptions, uYears),
        explain: `Uranus's orbit period divided by Earth's is about ${fmt(uYears, 1)}.`,
      },
    }),
    stop("neptune", {
      fact: `Sunlight takes about ${formatLightTime(sunlightSeconds(neptune))} to reach Neptune, on average.`,
      kind: "computed",
      quiz: {
        question: "About how long does sunlight take to reach Neptune?",
        options: ["30 minutes", "4 hours", "40 hours"],
        answer: closest(nOptions, nLightH),
        explain: `Average distance divided by the speed of light: ${formatLightTime(sunlightSeconds(neptune))}.`,
      },
    }),
  ];
}
