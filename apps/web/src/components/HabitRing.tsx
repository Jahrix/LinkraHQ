import React from "react";
import type { Habit } from "@linkra/shared";

interface HabitRingProps {
  habit: Habit;
  completed: boolean;
  streak: number;
  onToggle: () => void;
}

const RING_R = 28;
const RING_STROKE = 4;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

export default function HabitRing({ habit, completed, streak, onToggle }: HabitRingProps) {
  return (
    <button
      onClick={onToggle}
      className="flex flex-col items-center gap-1 flex-shrink-0 focus:outline-none"
      style={{ WebkitTapHighlightColor: "transparent", width: 72 }}
      data-habit-id={habit.id}
    >
      <div className="w-[72px] h-[72px] md:w-[80px] md:h-[80px] relative">
        <svg
          viewBox="0 0 72 72"
          className="w-full h-full"
        >
          {/* Background track */}
          <circle
            cx="36"
            cy="36"
            r={RING_R}
            fill="none"
            stroke={habit.color}
            strokeWidth={RING_STROKE}
            opacity={0.15}
          />
          {/* Progress ring */}
          <circle
            cx="36"
            cy="36"
            r={RING_R}
            fill="none"
            stroke={habit.color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={completed ? 0 : RING_CIRCUMFERENCE}
            transform="rotate(-90 36 36)"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
          {completed ? (
            <path
              d="M24 36l8 8 15-16"
              fill="none"
              stroke={habit.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <text
              x="36"
              y="36"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="22"
            >
              {habit.icon}
            </text>
          )}
        </svg>
      </div>
      <span className="text-[11px] text-white/70 w-full text-center truncate px-1 leading-tight">
        {habit.title}
      </span>
      <span className={`text-[10px] font-bold leading-none ${streak >= 7 ? "text-amber-400" : "text-white/30"}`}>
        {streak > 0 ? (streak >= 7 ? `🔥 ${streak}d` : `${streak}d`) : "—"}
      </span>
    </button>
  );
}
