// Cmd/Ctrl+K search (T42): which things can be jumped to, and how a typed query ranks them. Pure, so it is unit tested.
import { BODY_NAMES, SCENE_BODIES } from "./solar.ts";

export type Group = "Pages" | "Solar System" | "Candidates" | "Exoplanets" | "Lessons";

export type Entry = {
  id: string;
  label: string;
  /** A short line under the label. */
  hint: string;
  href: string;
  group: Group;
  /** Extra words that should find this entry. */
  keywords?: string;
};

const GROUP_ORDER: Group[] = ["Pages", "Candidates", "Exoplanets", "Solar System", "Lessons"];

/** The fixed pages. Classroom pages exist only when the server has Classroom on. */
export function pageEntries(classroom: boolean): Entry[] {
  const pages: Entry[] = [
    { id: "p-home", label: "Explore", hint: "The home page", href: "/", group: "Pages", keywords: "home start" },
    { id: "p-solar", label: "Solar System", hint: "Planets and orbits in 3D", href: "/solar-system", group: "Pages", keywords: "planets orbit sun" },
    { id: "p-exo", label: "Exoplanets", hint: "Planetary systems around other stars", href: "/exoplanets", group: "Pages", keywords: "systems stars" },
    { id: "p-hunt", label: "Hunt: candidate signals", hint: "What the pipeline found", href: "/candidates", group: "Pages", keywords: "candidates list transit" },
    { id: "p-scan", label: "Scan a star", hint: "Search one star yourself", href: "/scan", group: "Pages", keywords: "tic toi run" },
    { id: "p-missions", label: "Missions", hint: "The International Space Station and TESS", href: "/missions", group: "Pages", keywords: "iss tess space station" },
    { id: "p-learn", label: "Learn", hint: "Short lessons with quizzes", href: "/learn", group: "Pages", keywords: "lessons quiz badges" },
    { id: "p-method", label: "Method", hint: "How the search works and what it cannot tell you", href: "/method", group: "Pages", keywords: "pipeline how bls vetting" },
    { id: "p-privacy", label: "Privacy", hint: "What we keep and why", href: "/privacy", group: "Pages", keywords: "data cookies" },
  ];
  if (classroom) {
    pages.push(
      { id: "p-class", label: "Classroom", hint: "For teachers and students", href: "/classroom", group: "Pages", keywords: "teacher student school sign in" },
      { id: "p-scans", label: "My saved scans", hint: "Scans you kept", href: "/my-scans", group: "Pages", keywords: "saved list" },
      { id: "p-watch", label: "My watchlist", hint: "Candidates you follow, and email alerts", href: "/my-watchlist", group: "Pages", keywords: "watch alerts email" },
    );
  }
  return pages;
}

export function bodyEntries(): Entry[] {
  return SCENE_BODIES.map((id) => ({
    id: `b-${id}`,
    label: BODY_NAMES[id],
    hint: "Opens the Solar System view",
    href: "/solar-system",
    group: "Solar System" as const,
  }));
}

export function targetEntries(targets: { slug: string; target: string; classification_label: string }[]): Entry[] {
  return targets.map((t) => ({
    id: `t-${t.slug}`,
    label: t.target,
    hint: `Candidate signal: ${t.classification_label}`,
    href: `/candidates/${t.slug}`,
    group: "Candidates" as const,
    keywords: "candidate signal",
  }));
}

/** Each searched star also has a planetary system page (its confirmed planets and habitable zone). */
export function systemEntries(targets: { slug: string; target: string }[]): Entry[] {
  return targets.map((t) => ({
    id: `x-${t.slug}`,
    label: `${t.target} planetary system`,
    hint: "Confirmed planets and habitable zone",
    href: `/exoplanets/${t.slug}`,
    group: "Exoplanets" as const,
    keywords: "exoplanet system star planets habitable zone",
  }));
}

export function lessonEntries(lessons: { slug: string; title: string; summary: string }[]): Entry[] {
  return lessons.map((l) => ({
    id: `l-${l.slug}`,
    label: l.title,
    hint: l.summary,
    href: `/learn/${l.slug}`,
    group: "Lessons" as const,
  }));
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** How well one query word matches one entry: 0 means not at all. */
function wordScore(e: Entry, w: string): number {
  const label = norm(e.label);
  const compact = label.replace(/ /g, ""); // "toi 700" also answers to "toi700"
  if (label === w) return 100;
  if (compact === w) return 95;
  if (label.startsWith(w)) return 80;
  if (compact.startsWith(w)) return 75;
  if (label.split(" ").some((x) => x.startsWith(w))) return 60;
  if (label.includes(w)) return 40;
  if (norm(`${e.keywords ?? ""} ${e.hint}`).split(" ").some((x) => x.startsWith(w))) return 20;
  return 0;
}

/**
 * Entries that match every word of the query, best first. An empty query lists the pages. Ties keep the group order
 * (pages, candidates, solar system, lessons) and then the alphabet, so the same query always gives the same list.
 */
export function search(entries: Entry[], query: string, limit = 12): Entry[] {
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length === 0) return entries.filter((e) => e.group === "Pages").slice(0, limit);
  const scored: { e: Entry; s: number }[] = [];
  for (const e of entries) {
    let total = 0;
    for (const w of words) {
      const s = wordScore(e, w);
      if (s === 0) { total = 0; break; }
      total += s;
    }
    if (total > 0) scored.push({ e, s: total });
  }
  scored.sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.e.group) - GROUP_ORDER.indexOf(b.e.group) || a.e.label.localeCompare(b.e.label));
  return scored.slice(0, limit).map((x) => x.e);
}

/** True for Cmd+K or Ctrl+K, however the letter is capitalised. */
export function isOpenShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
}
