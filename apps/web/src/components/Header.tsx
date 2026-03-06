import React, { useEffect, useState } from "react";
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
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);
  const [prev, setPrev] = useState(score);

  useEffect(() => {
    if (score > prev) {
      setPulse("up");
    } else if (score < prev) {
      setPulse("down");
    }
    setPrev(score);
    if (score !== prev) {
      const t = setTimeout(() => setPulse(null), 600);
      return () => clearTimeout(t);
    }
  }, [score, prev]);

  const colorClass = pulse === "up"
    ? "text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)] scale-125"
    : pulse === "down"
      ? "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.8)] scale-90"
      : "text-white scale-100";

  return (
    <GlassPanel as="header" variant="quiet" className="app-header-shell flex items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-4">
      <div className="min-w-0 flex items-center gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white mb-0.5">Linkra HQ</h1>
          <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-[0.1em]">
            <svg className="w-3.5 h-3.5 text-accent-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDay(new Date())}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 lg:gap-4 flex-shrink-0">
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-accent">Momentum</span>
          <div className={`text-2xl lg:text-3xl font-black tracking-tighter tabular-nums leading-none transition-all duration-300 transform-gpu ${colorClass}`}>
            {score}
          </div>
        </div>

        <div className="w-px h-8 bg-stroke mx-1 hidden lg:block" />

        <button
          className="hidden lg:flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors border border-white/10 rounded-xl px-4 py-2"
          onClick={onOpenCommand}
          aria-label="Open command palette"
        >
          <span className="text-sm font-medium">Command</span>
          <Pill>⌘K</Pill>
        </button>

        <button
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition"
          onClick={onOpenCommand}
          aria-label="Open command palette"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5" />
            <path d="M12 12l2.5 2.5" />
          </svg>
        </button>
      </div>
    </GlassPanel>
  );
}

