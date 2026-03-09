import React, { useEffect, useState } from "react";
import Pill from "./Pill";
import GlassPanel from "./GlassPanel";
import { playGreetingSoundOnce } from "../lib/sounds";

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

export default function Header({
  score,
  userName,
  onOpenCommand,
  hideGreeting = false
}: {
  score: number;
  userName: string;
  onOpenCommand: () => void;
  hideGreeting?: boolean;
}) {
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);
  const [prev, setPrev] = useState(score);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

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

  const greeting = getGreeting(now.getHours());
  const firstName = (userName || "").split(" ")[0] || userName;

  const clockStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  useEffect(() => {
    if (hideGreeting) {
      return;
    }
    playGreetingSoundOnce(now);
  }, [hideGreeting, greeting]);

  return (
    <GlassPanel
      as="header"
      variant="quiet"
      className={`app-header-shell flex items-center gap-3 transition-all duration-500 ${hideGreeting
          ? "justify-end w-fit ml-auto px-4 py-2"
          : "justify-between px-4 py-3 lg:px-6 lg:py-4 w-full"
        }`}
    >
      {!hideGreeting && (
        <div className="min-w-0 flex items-center gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white mb-0.5">
              {greeting},{" "}
              <span className="text-accent-2">{firstName}</span>
            </h1>
            <div className="flex items-center gap-2.5 text-xs font-medium text-muted">
              <span className="tabular-nums tracking-wide">{clockStr}</span>
              <span className="w-px h-3 bg-white/15 inline-block" />
              <span>{dateStr}</span>
            </div>
          </div>
        </div>
      )}

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
