"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DOORS, readDoor, saveDoor, type Door } from "@/lib/door";

/** Three ways in. Choosing one is remembered in this browser only, to greet the person next time. */
export default function Doors() {
  const [last, setLast] = useState<Door | null>(null);
  useEffect(() => setLast(readDoor()), []);
  return (
    <ul className="door-grid" data-testid="doors">
      {DOORS.map((d) => (
        <li key={d.door} className={`door${last === d.door ? " door--last" : ""}`}>
          <h2 className="door-title">{d.title}</h2>
          <p className="door-text">{d.text}</p>
          {last === d.door && <p className="small muted" data-testid="door-last">You chose this last time.</p>}
          <Link href={d.href} className="btn btn--primary door-cta" onClick={() => saveDoor(d.door)}
            data-testid={`door-${d.door}`}>
            {d.cta}
          </Link>
        </li>
      ))}
    </ul>
  );
}
