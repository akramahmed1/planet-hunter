"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A modal panel on the native <dialog> element: a bottom sheet on phones and
 * a centered panel on wider screens. The browser provides the focus trap,
 * Escape to close and the backdrop; we restore focus to the opener on close.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    onClose();
    const el = opener.current;
    if (el instanceof HTMLElement) el.focus();
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-header">
          <h2 id={titleId} className="sheet-title">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
