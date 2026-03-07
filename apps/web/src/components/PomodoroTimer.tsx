import React from "react";
import GlassPanel from "./GlassPanel";
import { usePomodoro } from "../lib/pomodoroContext";

const DURATION = 25 * 60;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function PomodoroTimer() {
  const { status, task, secondsLeft, pausePomodoro, resumePomodoro, stopPomodoro } = usePomodoro();

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = (DURATION - secondsLeft) / DURATION;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const isDone = status === "done";
  const isPaused = status === "paused";

  return (
    <GlassPanel variant="hero" className="w-full relative overflow-hidden group">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-r from-accent/40 to-accent-2/20" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 p-4 md:p-6">
        {/* Left: task info */}
        <div className="flex-1 text-center md:text-left min-w-0">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full ${
              isDone ? "bg-accent" : isPaused ? "bg-yellow-400" : "bg-emerald-500 animate-pulse"
            }`} />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-accent-2">
              {isDone ? "Session Complete" : isPaused ? "Paused" : "Focus Mode — 25 min"}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white mb-2 leading-tight">
            {isDone ? "Well done." : (task?.taskText ?? "Focused work")}
          </h2>

          <div className="text-sm md:text-base text-muted font-medium flex items-center justify-center md:justify-start gap-2">
            <svg className="w-4 h-4 opacity-70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>{task?.projectName}</span>
          </div>
        </div>

        {/* Right: timer + controls */}
        <div className="flex-shrink-0 flex flex-col items-center gap-4">
          {/* Circular countdown */}
          <div className="relative w-32 h-32">
            <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
              <circle
                cx="64" cy="64" r={RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="7"
              />
              <circle
                cx="64" cy="64" r={RADIUS}
                fill="none"
                stroke={isDone ? "#8B5CF6" : "rgba(255,255,255,0.9)"}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={isDone ? 0 : strokeDashoffset}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {isDone ? (
                <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-3xl font-black tracking-tighter tabular-nums text-white">
                  {pad(minutes)}:{pad(seconds)}
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isDone && status === "running" && (
              <button
                className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-2 text-sm font-medium transition"
                onClick={pausePomodoro}
              >
                Pause
              </button>
            )}
            {!isDone && isPaused && (
              <button
                className="rounded-xl bg-white text-black hover:bg-white/90 px-5 py-2 text-sm font-semibold transition shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                onClick={resumePomodoro}
              >
                Resume
              </button>
            )}
            <button
              className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2 text-sm text-muted hover:text-white transition"
              onClick={stopPomodoro}
            >
              {isDone ? "Close" : "Stop"}
            </button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
