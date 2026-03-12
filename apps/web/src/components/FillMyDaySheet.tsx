import React, { useEffect, useRef, useState } from "react";
import type { Goal } from "@linkra/shared";
import { computeGoalMetrics, todayKey } from "@linkra/shared";
import { api, type SuggestedGoal, type QuotaInfo } from "../lib/api";
import { useAppState } from "../lib/state";
import { useAiQuota } from "../lib/aiQuotaContext";
import { useToast } from "../lib/toast";
import { cloneAppState } from "../lib/appStateModel";

interface FillMyDaySheetProps {
  open: boolean;
  onClose: () => void;
}

export default function FillMyDaySheet({ open, onClose }: FillMyDaySheetProps) {
  const { state, save } = useAppState();
  const { setQuota } = useAiQuota();
  const { push } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<SuggestedGoal[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Mobile swipe-to-close
  const touchStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const key = todayKey();
  const todayGoals = state?.dailyGoalsByDate[key]?.goals ?? [];
  const isPackedDay = todayGoals.length >= 8;

  // Load goals when sheet opens
  useEffect(() => {
    if (!open || !state) return;
    if (hasLoaded) return;

    setIsLoading(true);
    setError(null);
    setGoals([]);
    setChecked(new Set());

    api.fillMyDay(state)
      .then((result) => {
        // Filter out goals that already exist in today (by title match)
        const existingTitles = new Set(todayGoals.map((g) => g.title.toLowerCase()));
        const filtered = result.goals.filter(
          (g) => !existingTitles.has(g.title.toLowerCase())
        );
        setGoals(filtered);
        setChecked(new Set(filtered.map((_, i) => i)));
        // Update quota context
        const q = result.quota;
        setQuota({ used: q.used, remaining: q.remaining, dailyLimit: q.dailyLimit, isAdmin: false });
        setHasLoaded(true);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to generate goals";
        if (msg === "quota_exceeded" || msg.toLowerCase().includes("quota")) {
          setError("AI quota reached for today");
        } else {
          setError(msg);
          push(msg, "error");
        }
        setHasLoaded(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open]);

  // Reset hasLoaded when sheet closes so next open refetches
  useEffect(() => {
    if (!open) {
      setHasLoaded(false);
      setGoals([]);
      setChecked(new Set());
      setError(null);
    }
  }, [open]);

  const toggleChecked = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleAddToToday = async () => {
    if (!state) return;
    const selected = goals.filter((_, i) => checked.has(i));
    if (selected.length === 0) return;

    setIsAdding(true);
    try {
      const next = cloneAppState(state);
      const entry = next.dailyGoalsByDate[key];
      const now = new Date().toISOString();

      const newGoals: Goal[] = selected.map((g) => ({
        id: crypto.randomUUID(),
        title: g.title,
        category: g.category,
        points: g.points,
        done: false,
        createdAt: now,
        completedAt: null
      }));

      entry.goals = [...newGoals, ...entry.goals];
      const metrics = computeGoalMetrics(entry.goals);
      entry.completedPoints = metrics.completedPoints;
      entry.score = metrics.score;

      const saved = await save(next);
      if (saved) {
        push(`${selected.length} goal${selected.length !== 1 ? "s" : ""} added to today ✦`);
        onClose();
      } else {
        push("Failed to save goals.", "error");
      }
    } finally {
      setIsAdding(false);
    }
  };

  // Swipe down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 80) {
      touchStartY.current = null;
      onClose();
    }
  };
  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[80] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sheet — bottom sheet on mobile, centered modal on desktop */}
      <div
        ref={sheetRef}
        className="fixed z-[90] inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="relative w-full md:w-[520px] md:max-w-[95vw] rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: "#18181c",
            maxHeight: "85vh"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile only) */}
          <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-9 h-1 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="px-6 pt-4 pb-3 flex-shrink-0">
            <h2 className="text-xl font-black text-white tracking-tight">Here's your day</h2>
            <p className="text-sm text-white/40 mt-1">AI picked these based on your open tasks and momentum</p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-2">
            {isLoading && (
              <div className="flex items-center justify-center py-12 gap-3 text-white/40">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-bold">Analyzing your tasks...</span>
              </div>
            )}

            {error && !isLoading && (
              <div className="text-sm text-red-400 font-bold text-center py-8">{error}</div>
            )}

            {isPackedDay && !isLoading && !error && goals.length > 0 && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs font-bold">
                Your day is already packed — consider completing some goals first
              </div>
            )}

            {!isLoading && !error && goals.length > 0 && (
              <div className="space-y-2 pb-2">
                {goals.map((goal, i) => {
                  const isChecked = checked.has(i);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-xl border border-white/5 cursor-pointer transition-opacity"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        opacity: isChecked ? 1 : 0.4
                      }}
                      onClick={() => toggleChecked(i)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChecked(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 flex-shrink-0 cursor-pointer rounded accent-[#7c5cfc]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{goal.title}</div>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: "rgba(124,92,252,0.15)",
                          color: "#c4b0ff"
                        }}
                      >
                        {goal.category}
                      </span>
                      <span className="text-xs text-white/30 font-bold flex-shrink-0 ml-1">{goal.points} pts</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!isLoading && !error && goals.length === 0 && hasLoaded && (
              <div className="text-center py-8 text-white/30 text-sm">No goals suggested. Try adding more open tasks to your projects.</div>
            )}
          </div>

          {/* Footer buttons */}
          {!isLoading && !error && goals.length > 0 && (
            <div className="px-6 py-4 space-y-2 border-t border-white/5 flex-shrink-0">
              <button
                onClick={handleAddToToday}
                disabled={isAdding || checked.size === 0}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity"
                style={{
                  background: "#7c5cfc",
                  opacity: isAdding || checked.size === 0 ? 0.5 : 1,
                  cursor: isAdding || checked.size === 0 ? "not-allowed" : "pointer"
                }}
              >
                {isAdding ? "Adding..." : `Add to Today${checked.size > 0 ? ` (${checked.size})` : ""}`}
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl py-3 text-sm font-bold border transition-colors"
                style={{
                  background: "transparent",
                  borderColor: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)"
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Close button if error or empty */}
          {!isLoading && (error || goals.length === 0) && hasLoaded && (
            <div className="px-6 py-4 border-t border-white/5 flex-shrink-0">
              <button
                onClick={onClose}
                className="w-full rounded-xl py-3 text-sm font-bold border transition-colors"
                style={{
                  background: "transparent",
                  borderColor: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)"
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
