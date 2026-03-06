import React, { useEffect, useRef } from "react";

function focusableElements(node: HTMLElement) {
  return Array.from(
    node.querySelectorAll<HTMLElement>(
      "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])"
    )
  ).filter((el) => !el.hasAttribute("disabled"));
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Keep a stable ref to onClose so the effect never needs it as a dependency
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const root = bodyRef.current;

    // Only auto-focus the first element when the modal first opens.
    // We intentionally DON'T re-run this on every render, so typing in
    // a text field does not yank focus away.
    const focusables = focusableElements(root);
    focusables[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const current = focusableElements(root);
      if (!current.length) return;
      const start = current[0];
      const end = current[current.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && active === end) {
        event.preventDefault();
        start.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // ↓ Only re-run when `open` changes, NOT when onClose changes reference
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-10 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={bodyRef}
        className="glass-panel glass-standard w-full max-h-[92vh] max-w-2xl overflow-auto border-white/12 bg-[rgba(11,15,22,0.94)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-muted pb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="button-secondary" onClick={onClose} aria-label="Close modal">
            Close
          </button>
        </div>
        <div className="pt-4">{children}</div>
        {footer && <div className="mt-5 border-t border-muted pt-4">{footer}</div>}
      </div>
    </div>
  );
}

