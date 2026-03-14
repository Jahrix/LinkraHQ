import React, { useEffect, useRef, useState } from "react";
import Pill from "./Pill";
import GlassPanel from "./GlassPanel";
import { playGreetingSoundOnce } from "../lib/sounds";
import { useAiQuota } from "../lib/aiQuotaContext";

export const MOMENTUM_PULSE_MS = 5000;

export function resolveMomentumPulse(
  previousScore: number,
  nextScore: number,
  hasInitialized: boolean
): "up" | "down" | null {
  if (!hasInitialized || previousScore === nextScore) {
    return null;
  }
  return nextScore > previousScore ? "up" : "down";
}

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

function scoreColor(s: number): { color: string; filter?: string } {
  if (s >= 86) return { color: "#7c5cfc", filter: "drop-shadow(0 0 8px #7c5cfc)" };
  if (s >= 61) return { color: "#ffffff" };
  if (s >= 31) return { color: "#f59e0b" };
  return { color: "#ef4444" };
}

export default function Header({
  score,
  momentumSignal,
  userName,
  onOpenCommand,
  onMomentumClick,
  hideGreeting = false
}: {
  score: number;
  momentumSignal: number;
  userName: string;
  onOpenCommand: () => void;
  onMomentumClick: () => void;
  hideGreeting?: boolean;
}) {
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);
  const [prevSignal, setPrevSignal] = useState(momentumSignal);
  const [now, setNow] = useState(new Date());
  const hasInitializedScore = useRef(false);

  const animRef = useRef<number | null>(null);
  const [displayScore, setDisplayScore] = useState(score);
  useEffect(() => {
    const start = displayScore;
    const end = score;
    if (start === end) return;
    const duration = 400;
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      setDisplayScore(Math.round(start + (end - start) * t));
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  const { quota, isLoading: quotaLoading } = useAiQuota();
  const usedPct = quota.dailyLimit > 0 ? quota.used / quota.dailyLimit : 0;
  const quotaColor = usedPct < 0.5 ? "#ffffff" : usedPct < 0.8 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const nextPulse = resolveMomentumPulse(prevSignal, momentumSignal, hasInitializedScore.current);
    hasInitializedScore.current = true;
    setPrevSignal(momentumSignal);

    if (!nextPulse) {
      setPulse(null);
      return;
    }

    setPulse(nextPulse);
    const t = setTimeout(() => setPulse(null), MOMENTUM_PULSE_MS);
    return () => clearTimeout(t);
  }, [momentumSignal, prevSignal]);

  const { color, filter } = scoreColor(displayScore);
  const scaleClass = pulse === "up" ? "scale-125" : pulse === "down" ? "scale-90" : "scale-100";

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
        <button
          className="flex flex-col items-end hover:opacity-80 transition-opacity active:scale-95 transform-gpu group"
          onClick={onMomentumClick}
          title="View Momentum Breakdown"
        >
          <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-white/40 group-hover:text-white/60 transition-colors">Momentum</span>
          <div
            className={`text-2xl lg:text-3xl font-black tracking-tighter tabular-nums leading-none transition-all duration-300 transform-gpu ${scaleClass}`}
            style={{ color, filter }}
          >
            {displayScore}
          </div>
        </button>

        {!quotaLoading && (
          <>
            <div
              style={{ color: quotaColor, border: `1px solid ${quotaColor}33` }}
              className="hidden lg:flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
              title="AI calls remaining today"
            >
              ✦ {quota.used}/{quota.dailyLimit}
            </div>
            <div className="lg:hidden text-[11px] font-bold" style={{ color: quotaColor }}>
              ✦ {quota.remaining}
            </div>
          </>
        )}

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
