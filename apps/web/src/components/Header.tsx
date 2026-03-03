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
    <GlassPanel as="header" variant="quiet" className="app-header-shell flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Dashboard</p>
        <h2 className="text-2xl font-semibold tracking-[-0.04em]">Lock-in Dashboard</h2>
        <p className="mt-1 text-sm text-white/60">{formatDay(new Date())}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Lock-in score</div>
          <div className="text-2xl font-semibold tracking-[-0.03em]">{score}</div>
        </div>
        <button className="button-secondary rounded-2xl px-4 py-3" onClick={onOpenCommand} aria-label="Open command palette">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Command palette</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span>Open</span>
            <Pill>Cmd/Ctrl + K</Pill>
          </div>
        </button>
      </div>
    </GlassPanel>
  );
}
