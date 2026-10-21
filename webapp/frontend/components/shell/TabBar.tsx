"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Icon from "./Icon";
import { TAB_HREFS, isActive, visibleNav } from "./nav";


/** Phone navigation: four section tabs plus More, fixed to the bottom. */
export default function TabBar({ classroom }: { classroom: boolean }) {
  const pathname = usePathname() ?? "/";
  const nav = visibleNav(classroom);
  const TABS = nav.filter((n) => TAB_HREFS.includes(n.href));
  const MORE = nav.filter((n) => !TAB_HREFS.includes(n.href));
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((n) => isActive(n, pathname));

  // Close the sheet after navigating from it.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <nav className="tabbar" aria-label="Sections">
      <ul className="tabbar-list">
        {TABS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="tabbar-item"
              aria-current={isActive(item, pathname) ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="tabbar-item"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreActive ? "page" : undefined}
            onClick={() => setMoreOpen(true)}
          >
            <Icon name="more" />
            More
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="sheet-nav">
          {MORE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="sheet-link"
                aria-current={isActive(item, pathname) ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.soon && <span className="soon-tag">Soon</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </nav>
  );
}
