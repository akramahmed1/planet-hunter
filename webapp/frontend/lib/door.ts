// The three doors into Planet Hunter (launch task T22). The remembered door is a display preference kept in this
// browser only: it decides which words and shortcut are shown, never what anyone may do (the server decides that).

export type Door = "guest" | "teacher" | "student";

export const DOOR_KEY = "ph-door";

export const DOORS: { door: Door; title: string; text: string; href: string; cta: string }[] = [
  {
    door: "guest",
    title: "Explore as a guest",
    text: "No account needed. Look at real NASA data, try the Hunt lab and take a lesson.",
    href: "/",
    cta: "Start exploring",
  },
  {
    door: "teacher",
    title: "I'm a teacher",
    text: "Make a class, set lessons, quizzes and hunt challenges, and see your students' results.",
    href: "/classroom?as=teacher",
    cta: "Teacher sign in",
  },
  {
    door: "student",
    title: "I'm a student",
    text: "Join your class with the code your teacher gave you. Accounts are for ages 13 and up.",
    href: "/classroom?as=student",
    cta: "Join your class",
  },
];

/** Only the three known words count; anything else (an old value, a typo, something put there by hand) is ignored. */
export function parseDoor(value: unknown): Door | null {
  return value === "guest" || value === "teacher" || value === "student" ? value : null;
}

export function readDoor(): Door | null {
  try {
    return parseDoor(window.localStorage.getItem(DOOR_KEY));
  } catch {
    return null; // private window or blocked storage: the page works the same without a remembered door
  }
}

export function saveDoor(door: Door): void {
  try {
    window.localStorage.setItem(DOOR_KEY, door);
  } catch {
    // not remembered; nothing else depends on it
  }
}

export function forgetDoor(): void {
  try {
    window.localStorage.removeItem(DOOR_KEY);
  } catch {
    // nothing to forget
  }
}

export function doorFor(door: Door) {
  return DOORS.find((d) => d.door === door)!;
}
