"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./Icon";
import { useSession } from "@/lib/role";
import AccountMenu from "./AccountMenu";
import { isActive, visibleNav } from "./nav";
import CommandPalette from "./CommandPalette";
import UnitsButton from "./UnitsControls";

export default function TopBar({ classroom }: { classroom: boolean }) {
  const pathname = usePathname() ?? "/";
  const { role, known } = useSession(classroom);
  const nav = visibleNav(classroom, role);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="Planet Hunter home">
          <BrandMark />
          Planet Hunter
        </Link>
        <nav className="topnav" aria-label="Primary">
          <ul className="topnav-list">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="topnav-link"
                  aria-current={isActive(item, pathname) ? "page" : undefined}
                >
                  {item.label}
                  {item.soon && (
                    <>
                      <span className="soon-dot" aria-hidden="true" title="Coming soon" />
                      <span className="sr-only">(coming soon)</span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="topbar-actions">
          <CommandPalette classroom={classroom} />
          <UnitsButton />
          {classroom && <AccountMenu role={role} known={known} />}
        </div>
      </div>
    </header>
  );
}
