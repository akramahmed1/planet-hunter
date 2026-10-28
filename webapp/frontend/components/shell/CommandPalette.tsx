"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { apiV2Send } from "@/lib/api-v2";
import {
  bodyEntries, isOpenShortcut, lessonEntries, systemEntries, pageEntries, search, targetEntries, type Entry,
} from "@/lib/command";

type Targets = { targets: { slug: string; target: string; classification_label: string }[] };
type Lessons = { lessons: { slug: string; title: string; summary: string }[] };

/**
 * Jump to a page, planet, candidate or lesson by typing. Opens with Cmd+K or Ctrl+K, or with the Search button (the only
 * way on a phone). The candidates and lessons are fetched once, the first time it opens; until then, or if that fails,
 * the pages and planets still work.
 */
export default function CommandPalette({ classroom }: { classroom: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [extra, setExtra] = useState<Entry[]>([]);
  const loaded = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isOpenShortcut(e)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    // The dialog is shown by Sheet in an effect of its own; focus the box once it is on screen.
    const t = setTimeout(() => input.current?.focus(), 0);
    if (loaded.current) return () => clearTimeout(t);
    loaded.current = true;
    Promise.all([
      apiV2Send<Targets>("GET", "/api/v2/targets"),
      apiV2Send<Lessons>("GET", "/api/v2/lessons"),
    ]).then(([a, b]) => {
      setExtra([
        ...(a.ok ? targetEntries(a.data.targets) : []),
        ...(a.ok ? systemEntries(a.data.targets) : []),
        ...(b.ok ? lessonEntries(b.data.lessons) : []),
      ]);
    });
    return () => clearTimeout(t);
  }, [open]);

  const entries = useMemo(() => [...pageEntries(classroom), ...bodyEntries(), ...extra], [classroom, extra]);
  const results = useMemo(() => search(entries, query), [entries, query]);

  function go(e: Entry) {
    setOpen(false);
    router.push(e.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
  }

  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm cmd-open" onClick={() => setOpen(true)}
        aria-label="Search the site" aria-keyshortcuts="Control+K Meta+K" data-testid="cmd-open">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="cmd-open-label">Search</span>
        <kbd className="cmd-kbd" aria-hidden="true">Ctrl K</kbd>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Search Planet Hunter">
        <div className="cmd" data-testid="cmd">
          <label htmlFor={`${id}-q`} className="sr-only">Type a page, planet, candidate or lesson</label>
          <input id={`${id}-q`} ref={input} className="select cmd-input" type="text" role="combobox" autoComplete="off"
            aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={results[active] ? `${id}-${results[active].id}` : undefined}
            placeholder="Type a page, planet, candidate or lesson" value={query} data-testid="cmd-input"
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          <ul id={`${id}-list`} role="listbox" aria-label="Results" className="cmd-list" data-testid="cmd-list">
            {results.map((r, i) => (
              <li key={r.id} id={`${id}-${r.id}`} role="option" aria-selected={i === active} className="cmd-item"
                onMouseMove={() => setActive(i)} onClick={() => go(r)}>
                <span className="cmd-item-main"><span className="cmd-item-label">{r.label}</span>
                  <span className="cmd-item-hint">{r.hint}</span></span>
                <span className="cmd-item-group">{r.group}</span>
              </li>
            ))}
          </ul>
          <p className="muted small" role="status" data-testid="cmd-status">
            {results.length === 0 ? "Nothing matches that. Try a planet, a TOI number or a lesson name." : `${results.length} ${results.length === 1 ? "result" : "results"}. Use the arrow keys and Enter.`}
          </p>
        </div>
      </Sheet>
    </>
  );
}
