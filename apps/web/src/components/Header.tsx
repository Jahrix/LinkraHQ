import React from "react";
import { formatDay } from "../lib/date";
import Pill from "./Pill";

export default function Header({
  score,
  onOpenCommand
}: {
  score: number;
  onOpenCommand: () => void;
}) {
  return (
    <header className="glass-standard flex items-center justify-between gap-6 px-4 py-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Dashboard</p>
        <h2 className="text-xl font-semibold">Lock-in Dashboard</h2>
        <p className="mt-1 text-sm text-white/60">{formatDay(new Date())}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Lock-in score</div>
          <div className="text-xl font-semibold">{score}</div>
        </div>
        <button className="button-secondary rounded-xl px-3 py-2" onClick={onOpenCommand} aria-label="Open command palette">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Command palette</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span>Open</span>
            <Pill>Cmd/Ctrl + K</Pill>
          </div>
        </button>
      </div>
    </header>
  );
}
