// The tour's facts and quiz answers must follow from the NSSDCA data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildTour, TOUR_ORDER, type TourBody } from "./tour.ts";

const DATA = join(import.meta.dirname, "..", "..", "backend", "data", "bodies.v1.json");
const FIXTURES = join(import.meta.dirname, "..", "..", "backend", "tests", "fixtures", "external");

type Raw = {
  id: string;
  name: string;
  source: { name: string; url: string };
  facts: Record<string, number | null>;
  temperatures: { label: string; kelvin?: number }[];
};

// The same shape /api/v2/bodies serves, built from the bundled dataset.
function bodies(): Record<string, TourBody> {
  const raw: Raw[] = JSON.parse(readFileSync(DATA, "utf8")).bodies;
  const q = (v: number | null | undefined) => (v === null || v === undefined ? null : { value: v });
  return Object.fromEntries(
    raw.map((b) => [
      b.id,
      {
        id: b.id,
        name: b.name,
        source: { name: b.source.name, url: b.source.url },
        mass: q(b.facts.mass_1e24_kg),
        semimajor_axis: q(b.facts.semimajor_axis_1e6_km),
        orbit_period: q(b.facts.orbit_period_days),
        day_length: q(b.facts.day_length_hours),
        temperatures: b.temperatures.map((t) => ({
          label: t.label,
          value: t.kelvin === undefined ? null : { kelvin: t.kelvin },
        })),
      },
    ]),
  );
}

describe("tour", () => {
  const data = bodies();
  const tour = buildTour(data);
  const byId = Object.fromEntries(tour.map((s) => [s.id, s]));

  it("runs Sun to Neptune, one stop each, with sources", () => {
    assert.deepEqual(
      tour.map((s) => s.id),
      [...TOUR_ORDER],
    );
    for (const s of tour) {
      assert.match(s.source.url, /^https:\/\/nssdc\.gsfc\.nasa\.gov\//);
      assert.ok(s.quiz.answer >= 0 && s.quiz.answer < s.quiz.options.length, s.id);
      // Site copy rule: no em or en dashes.
      for (const text of [s.fact, s.quiz.question, s.quiz.explain, ...s.quiz.options]) {
        assert.doesNotMatch(text, /[–—]/, s.id);
      }
    }
  });

  it("answers follow from the data", () => {
    const opt = (id: string) => byId[id].quiz.options[byId[id].quiz.answer];
    assert.equal(opt("sun"), "The core");
    assert.equal(opt("mercury"), "One day");
    assert.equal(opt("venus"), "Venus");
    assert.equal(opt("earth"), "8 minutes");
    assert.equal(opt("mars"), "Longer");
    assert.equal(opt("jupiter"), "318");
    assert.equal(opt("saturn"), "29");
    assert.equal(opt("uranus"), "84");
    assert.equal(opt("neptune"), "4 hours");
  });

  it("worded claims match the data", () => {
    // "one sunrise to the next takes about two of its years"
    const m = data.mercury;
    assert.equal(Math.round(m.day_length!.value / 24 / m.orbit_period!.value), 2);
    // "Its thick carbon dioxide air traps heat": NSSDCA lists Venus's atmosphere as 96.5% CO2.
    assert.match(readFileSync(join(FIXTURES, "nssdca_venusfact.html"), "utf8"), /96\.5% Carbon Dioxide/);
    assert.match(byId.earth.fact, /8 min 19 s/);
  });
});
