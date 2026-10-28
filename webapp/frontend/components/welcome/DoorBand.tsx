"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doorFor, forgetDoor, readDoor, type Door } from "@/lib/door";

/** A slim line at the top of the home page while Classroom is on. It never redirects: it only offers the way in, so
 * shared links and bookmarks land exactly where they point. */
export default function DoorBand() {
  const [door, setDoor] = useState<Door | null | undefined>(undefined);
  useEffect(() => setDoor(readDoor()), []);
  if (door === undefined) return <div className="door-band door-band--wait" aria-hidden="true" />;
  const d = door && door !== "guest" ? doorFor(door) : null;
  return (
    <p className="door-band" data-testid="door-band">
      {d ? (
        <>
          Last time you chose {door === "teacher" ? "teacher" : "student"}. <Link href={d.href} data-testid="door-band-go">{d.cta}</Link> or{" "}
          <button type="button" className="link-btn" onClick={() => { forgetDoor(); setDoor(null); }}
            data-testid="door-band-change">choose another way in</button>.
        </>
      ) : (
        <>
          Teacher or student? <Link href="/welcome" data-testid="door-band-go">Choose your way in</Link>.
        </>
      )}
    </p>
  );
}
