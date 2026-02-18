import React from "react";
import { formatDay } from "../lib/date";

export default function Header({
  score,
  onOpenCommand
}: {
  score: number;
  onOpenCommand: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-6">
      <div>
        <h2 className="text-xl font-semibold">Lock-in Dashboard</h2>
        <p className="text-sm text-white/60 mt-1">{formatDay(new Date())}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="panel">
          <div className="text-xs text-white/50 uppercase tracking-[0.2em]">Score</div>
          <div className="text-xl font-semibold">{score}</div>
        </div>
        <button className="panel hover-lift" onClick={onOpenCommand}>
          <div className="text-xs text-white/50 uppercase tracking-[0.2em]">Command</div>
          <div className="flex items-center gap-2">
            <span>Open</span>
            <span className="rounded-lg bg-white/10 px-2 py-1 text-xs">Ctrl/Cmd + K</span>
          </div>
        </button>
      </div>
    </header>
  );
}
