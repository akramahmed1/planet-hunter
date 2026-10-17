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
  { href: "/exoplanets", label: "Exoplanets", icon: "exoplanets", soon: true },
  { href: "/candidates", label: "Hunt", icon: "hunt", match: ["/candidates"] },
  { href: "/missions", label: "Missions", icon: "missions", soon: true },
  { href: "/learn", label: "Learn", icon: "learn", soon: true },
  { href: "/method", label: "Method", icon: "method" },
  { href: "/classroom", label: "Classroom", icon: "classroom", soon: true },
];

/** The four sections that get their own phone tab; the rest live under More. */
export const TAB_HREFS = ["/", "/solar-system", "/exoplanets", "/candidates"];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
