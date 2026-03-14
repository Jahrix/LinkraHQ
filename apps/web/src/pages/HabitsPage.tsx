import React, { useState, useEffect } from "react";
import { type Habit, isHabitDueToday } from "@linkra/shared";
import { useAppState } from "../lib/state";
import { useHabitContext } from "../lib/habitContext";
import { useToast } from "../lib/toast";
import GlassPanel from "../components/GlassPanel";
import HabitRing from "../components/HabitRing";
import HabitSheet from "../components/HabitSheet";
import { api } from "../lib/api";

export default function HabitsPage() {
  const { state } = useAppState();
  const { habits, completedTodayIds, streaks, brokenStreaks, isLoading: loading, toggleHabit, recoverStreak, saveHabit, archiveHabit, deleteHabit, refreshHabits } = useHabitContext();
  const { push: toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [hoveredHabitId, setHoveredHabitId] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [archivedHabits, setArchivedHabits] = useState<Habit[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  const activeHabits = habits.filter(h => !h.archivedAt);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || sheetOpen) {
        return;
      }
      if (!hoveredHabitId) return;

      if (e.key === "Backspace" || e.key === "Delete") {
        const h = activeHabits.find(h => h.id === hoveredHabitId);
        if (h) {
          e.preventDefault();
          if (window.confirm(`Delete habit "${h.title}" forever?`)) {
            deleteHabit(h.id);
          }
        }
      } else if (e.key.toLowerCase() === "e") {
        const h = activeHabits.find(h => h.id === hoveredHabitId);
        if (h) {
          e.preventDefault();
          archiveHabit(h.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hoveredHabitId, activeHabits, sheetOpen, deleteHabit, archiveHabit]);

  useEffect(() => {
    if (showArchived) {
      setLoadingArchived(true);
      api.getHabits(true).then(setArchivedHabits).finally(() => setLoadingArchived(false));
    }
  }, [showArchived]);

  async function handleRestore(h: Habit) {
    if (!h.id) return;
    
    // Optimistic update
    setArchivedHabits(prev => prev.filter(x => x.id !== h.id));
    
    try {
      await saveHabit({ archivedAt: null }, h.id);
      toast(`"${h.title}" has been restored to active habits.`, "success");
    } catch (err) {
      toast("Failed to restore habit.", "error");
      refreshHabits();
    }
  }

  async function handleSave(data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>) {
    await saveHabit(data, editingHabit?.id);
    setSheetOpen(false);
    setEditingHabit(null);
  }

  async function handleAutoSave(data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>) {
    if (!editingHabit) return;
    await saveHabit(data, editingHabit.id);
  }

  async function handleArchive() {
    if (!editingHabit) return;
    await archiveHabit(editingHabit.id);
    setSheetOpen(false);
    setEditingHabit(null);
  }

  async function handleDelete() {
    if (!editingHabit) return;
    await deleteHabit(editingHabit.id);
    setSheetOpen(false);
    setEditingHabit(null);
  }

  const todayHabits = activeHabits.filter(isHabitDueToday);
  const allDoneToday = todayHabits.length > 0 && todayHabits.every(h => completedTodayIds.has(h.id));
  const maxStreak = Math.max(0, ...activeHabits.map(h => streaks[h.id] ?? 0).filter(s => s >= 7));

  const projectOptions = (state?.projects ?? [])
    .filter(p => p.status !== "Archived")
    .map(p => ({ value: p.id, label: p.name }));

  const openCreate = () => { setEditingHabit(null); setSheetOpen(true); };
  const openEdit = (h: Habit) => { setEditingHabit(h); setSheetOpen(true); };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Habits</h1>
          <p className={`text-sm font-bold mt-0.5 ${maxStreak >= 7 ? "text-accent" : "text-white/40"}`}>
            {maxStreak >= 7 ? `${maxStreak} day streak` : "Build your streaks"}
          </p>
        </div>
        <button
          className="button-primary flex items-center gap-2 text-sm"
          onClick={openCreate}
        >
          <span className="text-lg leading-none">+</span>
          New Habit
        </button>
      </div>

      {/* Today Section */}
      {todayHabits.length > 0 && (
        <GlassPanel variant="standard" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Today</span>
            <span className="text-[10px] text-white/30">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>
          {allDoneToday ? (
            <div className="text-center py-4 text-green-400 font-bold text-sm">All done today 🔥</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-1">
              {todayHabits.map(h => (
                <HabitRing
                  key={h.id}
                  habit={h}
                  completed={completedTodayIds.has(h.id)}
                  streak={streaks[h.id] ?? 0}
                  onToggle={() => toggleHabit(h)}
                />
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* All Habits */}
      {activeHabits.length === 0 && !loading ? (
        <GlassPanel variant="standard" className="p-12 flex flex-col items-center text-center gap-3">
          <span className="text-5xl">⚡</span>
          <p className="text-white/60 font-bold">No habits yet.</p>
          <p className="text-white/30 text-sm">Build the behaviors that compound.</p>
          <button className="button-primary mt-2 text-sm" onClick={openCreate}>
            + Create your first habit
          </button>
        </GlassPanel>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">All Habits</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeHabits.map(h => {
              const streak = streaks[h.id] ?? 0;
              const progress = Math.min(100, Math.round((streak / h.targetStreak) * 100));
              return (
                <button
                  key={h.id}
                  onClick={() => openEdit(h)}
                  onMouseEnter={() => setHoveredHabitId(h.id)}
                  onMouseLeave={() => setHoveredHabitId(null)}
                  onFocus={() => setHoveredHabitId(h.id)}
                  onBlur={() => setHoveredHabitId(null)}
                  className="text-left bg-[#1a1a1f] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/20"
                  data-habit-id={h.id}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                    style={{ backgroundColor: h.color }}
                  />
                  <div className="pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg leading-none">{h.icon}</span>
                      <span className="font-bold text-white text-sm truncate flex-1">{h.title}</span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted border border-white/10 rounded-full px-2 py-0.5 flex-shrink-0">
                        {h.frequency}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-xs font-bold ${streak >= 7 ? "text-amber-400" : "text-white/40"}`}>
                        {streak >= 7 ? `🔥 ${streak}d` : streak > 0 ? `${streak}d` : "0d"}
                      </span>
                      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress}%`, backgroundColor: h.color }}
                        />
                      </div>
                      <span className="text-[10px] text-white/20 flex-shrink-0">
                        {streak}/{h.targetStreak}
                      </span>
                    </div>
                    {brokenStreaks[h.id] ? (
                      <div className="mt-3 pt-3 border-t border-white/5 flex gap-2 items-center justify-between">
                        <span className="text-xs text-white/60">
                          Streak of {brokenStreaks[h.id]} lost yesterday
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); recoverStreak(h); }}
                          className="text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-1 transition-colors"
                        >
                          Recover
                        </button>
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Archived Habits Toggle */}
      <div className="flex justify-center mt-4">
        <button
          onClick={() => setShowArchived(p => !p)}
          className="text-white/30 hover:text-white/60 text-xs font-bold transition-colors"
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </button>
      </div>

      {showArchived && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Archived</span>
          </div>
          {loadingArchived ? (
            <div className="text-white/30 text-xs text-center py-4">Loading...</div>
          ) : archivedHabits.length === 0 ? (
            <div className="text-white/30 text-xs text-center py-4">No archived habits.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {archivedHabits.map(h => (
                <div
                  key={h.id}
                  className="bg-[#1a1a1f] border border-white/5 rounded-2xl p-4 flex items-center justify-between opacity-50 relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: h.color }} />
                  <div className="pl-3 flex items-center gap-2">
                    <span className="text-lg leading-none">{h.icon}</span>
                    <span className="font-bold text-white text-sm line-through">{h.title}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRestore(h); }}
                    className="button-secondary text-xs px-3 py-1 bg-white/5 hover:bg-white/10"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <HabitSheet
        open={sheetOpen}
        habit={editingHabit}
        projectOptions={projectOptions}
        onSave={handleSave}
        onAutoSave={handleAutoSave}
        onArchive={editingHabit ? handleArchive : undefined}
        onDelete={editingHabit ? handleDelete : undefined}
        onClose={() => { setSheetOpen(false); setEditingHabit(null); }}
      />
    </div>
  );
}
