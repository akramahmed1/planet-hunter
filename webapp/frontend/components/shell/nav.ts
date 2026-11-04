export type IconName = "explore" | "solar" | "exoplanets" | "hunt" | "missions" | "learn" | "method" | "classroom" | "more";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** True until the section is built; it shows a "Soon" tag and a placeholder page. */
  soon?: boolean;
  /** Extra path prefixes that count as this section being active. */
  match?: string[];
};

export const NAV: NavItem[] = [
  { href: "/", label: "Explore", icon: "explore" },
  { href: "/solar-system", label: "Solar System", icon: "solar" },
  { href: "/exoplanets", label: "Exoplanets", icon: "exoplanets" },
  { href: "/candidates", label: "Hunt", icon: "hunt", match: ["/candidates", "/scan"] },
  { href: "/missions", label: "Missions", icon: "missions" },
  { href: "/learn", label: "Learn", icon: "learn" },
  { href: "/method", label: "Method", icon: "method" },
  { href: "/classroom", label: "Classroom", icon: "classroom" },
];

/** Who is signed in, as far as the navigation needs to know. It changes words only; the server decides access. */
export type Role = "teacher" | "student" | null;

/** Parse the /auth/me reply into a navigation role. Anything unexpected means signed out. */
export function roleFromMe(body: unknown): Role {
  const kind = (body as { me?: { kind?: unknown } } | null)?.me?.kind;
  return kind === "teacher" || kind === "student" ? kind : null;
}

/** What the Classroom link is called for each role. Signed out (or not yet known) it is just "Classroom". */
export function classroomLabel(role: Role): string {
  return role === "teacher" ? "My classes" : role === "student" ? "My assignments" : "Classroom";
}

/**
 * The sections to show. Classroom appears only when the server has it switched on (CLASSROOM_ENABLED), and its
 * words follow the signed-in role. Exoplanets (the 3D systems) is a main section for everyone.
 */
export function visibleNav(classroom: boolean, role: Role = null): NavItem[] {
  if (!classroom) return NAV.filter((n) => n.icon !== "classroom");
  return NAV.map((n) => (n.icon === "classroom" ? { ...n, label: classroomLabel(role) } : n));
}

/** The four sections that get their own phone tab; the rest live under More. */
export const TAB_HREFS = ["/", "/solar-system", "/exoplanets", "/candidates"];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
