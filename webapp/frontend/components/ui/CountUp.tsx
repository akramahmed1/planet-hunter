"use client";

import { useEffect, useRef } from "react";
import { COUNT_UP_FROM, COUNT_UP_MS, countUpValue } from "@/lib/countUp";

/**
 * A whole number that counts up to its value the first time it scrolls into view. The server sends the real number, so
 * without JavaScript, for a screen reader, in search results and with reduced motion it is simply the number. The box is
 * as wide as the final number from the start, so nothing shifts while the digits change.
 */
export default function CountUp({ value, grouped = false }: { value: number; grouped?: boolean }) {
  const fmt = (n: number) => (grouped ? n.toLocaleString("en-US") : String(n));
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current || !Number.isInteger(value) || value < COUNT_UP_FROM || typeof IntersectionObserver === "undefined") return;
    const text = el.firstChild;
    if (!text || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // less motion: just the number
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      done.current = true;
      el.dataset.counting = "true";
      const t0 = performance.now();
      const step = (now: number) => {
        const shown = countUpValue(value, now - t0);
        text.nodeValue = fmt(shown);
        if (now - t0 < COUNT_UP_MS) raf = requestAnimationFrame(step);
        else delete el.dataset.counting;
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      delete el.dataset.counting; // a new value from React replaces the text itself
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, grouped]);

  return (
    <span ref={ref} className="countup" style={{ minWidth: `${fmt(value).length}ch` }}>
      {fmt(value)}
    </span>
  );
}
