import React from "react";
import { formatDay } from "../lib/date";
import Pill from "./Pill";
import GlassPanel from "./GlassPanel";

export default function Header({
  score,
  onOpenCommand
}: {
  score: number;
  onOpenCommand: () => void;
}) {
  return (
    <GlassPanel as="header" variant="quiet" className="app-header-shell flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-4">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.28em] text-muted">Dashboard</p>
        <h2 className="text-lg lg:text-2xl font-semibold tracking-[-0.04em] truncate">Lock-in Dashboard</h2>
        <p className="mt-0.5 text-xs lg:text-sm text-muted">{formatDay(new Date())}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Score chip — always visible */}
        <div className="rounded-xl border border-muted bg-subtle px-3 py-2 lg:px-4 lg:py-3">
          <div className="text-[9px] lg:text-[11px] uppercase tracking-[0.2em] text-muted">Score</div>
          <div className="text-lg lg:text-2xl font-semibold tracking-[-0.03em] text-center">{score}</div>
        </div>
        {/* Command palette — only on desktop */}
        <button
          className="hidden lg:block button-secondary rounded-2xl px-4 py-3"
          onClick={onOpenCommand}
          aria-label="Open command palette"
        >
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted">Command palette</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span>Open</span>
            <Pill>Cmd/Ctrl + K</Pill>
          </div>
        </button>
        {/* Command palette icon button — mobile only */}
        <button
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-muted bg-subtle text-muted hover:text-strong transition"
          onClick={onOpenCommand}
          aria-label="Open command palette"
          title="Open command palette (⌘K)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5" />
            <path d="M12 12l2.5 2.5" />
          </svg>
        </button>
      </div>
    </GlassPanel>
  );
}

