"use client";

import { useEffect, useState } from "react";

// A template (unlike a layout) is made fresh on every navigation. A page slides in a few pixels when you move to it
// from another page. The first page of a visit does not: it should be there and ready to use straight away, and nobody
// has "navigated" yet. The motion lives in CSS and is switched off there for people who ask for less motion.
let pageHasLoaded = false; // only ever set in the browser, so server renders never carry the class

export default function Template({ children }: { children: React.ReactNode }) {
  const [slide] = useState(pageHasLoaded);
  useEffect(() => {
    pageHasLoaded = true;
  }, []);
  return <div className={slide ? "page-enter" : undefined}>{children}</div>;
}
