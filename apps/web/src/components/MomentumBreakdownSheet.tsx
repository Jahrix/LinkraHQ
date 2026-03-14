import React, { useRef } from "react";
import { todayKey } from "@linkra/shared";
import { useAppState } from "../lib/state";
import type { MomentumHistory } from "../lib/momentum";

interface MomentumBreakdownSheetProps {
  open: boolean;
  onClose: () => void;
  currentMomentum: number;
  streak: number;
  dailyGoalProgress: number;
  roadmapProgress: number;
  habitsProgress: number;
  history: MomentumHistory[];
}

export default function MomentumBreakdownSheet({
  open,
  onClose,
  currentMomentum,
  streak,
  dailyGoalProgress,
  roadmapProgress,
  habitsProgress,
  history,
}: MomentumBreakdownSheetProps) {
  const { state } = useAppState();
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  if (!open || !state) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 50) {
      onClose();
      touchStartY.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div 
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="relative w-full max-w-lg bg-[#0A0A0A] border-t sm:border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl p-6 sm:p-8 animate-in slide-in-from-bottom duration-500 overflow-hidden"
      >
        {/* Handle for mobile */}
        <div className="sm:hidden w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6" />

        {/* Glossy Header Effect */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />

        <div className="relative">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Your Momentum</h2>
              <p className="text-white/40 text-sm mt-1">Real-time performance tracker</p>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-4xl font-black text-indigo-400 tabular-nums leading-none">
                {currentMomentum}
              </div>
              <div className="text-[10px] font-bold text-indigo-500/60 uppercase tracking-widest mt-1">Score</div>
            </div>
          </div>

          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center">
              <span className="text-sm text-white/40 mb-1">Current Streak</span>
              <span className="text-2xl font-bold text-white tabular-nums">
                {streak} <span className="text-orange-500 text-lg">🔥</span>
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center">
              <span className="text-sm text-white/40 mb-1">Daily Capacity</span>
              <span className="text-2xl font-bold text-white">
                {Math.min(100, Math.round(dailyGoalProgress + roadmapProgress + habitsProgress))}%
              </span>
            </div>
          </div>

          {/* Breakdown Section */}
          <div className="space-y-6 mb-8">
            <h3 className="text-xs font-bold text-white/20 uppercase tracking-[0.2em]">Today's Contribution</h3>
            
            <BreakdownItem 
              label="Daily Goals" 
              value={dailyGoalProgress} 
              color="indigo"
              description="Focus and clarity for your day"
            />
            <BreakdownItem 
              label="Roadmap Tasks" 
              value={roadmapProgress} 
              color="emerald"
              description="Long-term project advancement"
            />
            <BreakdownItem 
              label="Habits" 
              value={habitsProgress} 
              color="rose"
              description="Consistency and personal growth"
            />
          </div>

          {/* Graph Placeholder / History Placeholder */}
          <div className="mt-8 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Weekly Trends</h4>
              <span className="text-[10px] text-indigo-400 font-bold bg-indigo-400/10 px-2 py-0.5 rounded">BETA</span>
            </div>
            <div className="h-24 flex items-end gap-1 px-2">
              {history.map((day, i) => (
                <div 
                  key={day.date} 
                  className="flex-1 bg-indigo-500/20 rounded-t-sm relative group"
                  style={{ height: `${Math.max(10, Math.min(100, day.score))}%` }}
                >
                  <div className="absolute inset-0 bg-indigo-500 opacity-20 group-hover:opacity-100 transition-opacity rounded-t-sm" />
                  {i === history.length - 1 && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 px-1">
              <span className="text-[10px] text-white/20">Mon</span>
              <span className="text-[10px] text-white/20">Sun</span>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-full mt-8 py-4 px-6 rounded-2xl bg-white text-black font-bold text-sm hover:bg-white/90 transition-colors active:scale-95 duration-200"
          >
            Keep Crushing It
          </button>
        </div>
      </div>
    </div>
  );
}

function BreakdownItem({ label, value, color, description }: { label: string, value: number, color: string, description: string }) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500"
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-white/80 block">{label}</span>
          <span className="text-[10px] text-white/30">{description}</span>
        </div>
        <span className="text-sm font-bold text-white tabular-nums">+{Math.round(value)}</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colors[color]} shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all duration-1000 ease-out`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}
