import React, { useEffect, useState } from "react";
import { type Habit, computeHabitStreak, isHabitDueToday, todayKey } from "@linkra/shared";
import { api } from "../lib/api";
import { useAppState } from "../lib/state";
import GlassPanel from "../components/GlassPanel";
import HabitRing from "../components/HabitRing";
import HabitSheet from "../components/HabitSheet";

export default function HabitsPage() {
  const { state } = useAppState();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  const today = todayKey();
  const since60 = (() => { const d = new Date(); d.setDate(d.getDate() - 61); return d.toISOString().slice(0, 10); })();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [habitsData, todayIds] = await Promise.all([api.getHabits(), api.getAllCompletionsToday()]);
      setHabits(habitsData);
      setCompletedTodayIds(new Set(todayIds));
      const results = await Promise.all(
        habitsData.map(h =>
          api.getHabitCompletions(h.id, since60).then(cs => ({
            id: h.id,
            streak: computeHabitStreak(cs.map(c => c.date))
          }))
        )
      );
      const map: Record<string, number> = {};
      results.forEach(({ id, streak }) => { map[id] = streak; });
      setStreaks(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(habit: Habit) {
    const isCompleted = completedTodayIds.has(habit.id);
    setCompletedTodayIds(prev => {
      const next = new Set(prev);
      if (isCompleted) next.delete(habit.id); else next.add(habit.id);
      return next;
    });
    try {
      if (isCompleted) {
        await api.uncompleteHabit(habit.id, today);
        setStreaks(prev => ({ ...prev, [habit.id]: Math.max(0, (prev[habit.id] || 0) - 1) }));
      } else {
        await api.completeHabit(habit.id, today);
        setStreaks(prev => ({ ...prev, [habit.id]: (prev[habit.id] || 0) + 1 }));
      }
    } catch {
      setCompletedTodayIds(prev => {
        const next = new Set(prev);
        if (isCompleted) next.add(habit.id); else next.delete(habit.id);
        return next;
      });
    }
  }

  async function handleSave(data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>) {
    try {
      if (editingHabit) {
        const updated = await api.updateHabit(editingHabit.id, data);
        setHabits(prev => prev.map(h => h.id === editingHabit.id ? updated : h));
      } else {
        const created = await api.createHabit(data as Omit<Habit, "id" | "createdAt" | "updatedAt">);
        setHabits(prev => [created, ...prev]);
      }
      setSheetOpen(false);
      setEditingHabit(null);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleArchive() {
    if (!editingHabit) return;
    try {
      await api.deleteHabit(editingHabit.id);
      setHabits(prev => prev.filter(h => h.id !== editingHabit.id));
      setSheetOpen(false);
      setEditingHabit(null);
    } catch (e) {
      console.error(e);
    }
  }

  const todayHabits = habits.filter(isHabitDueToday);
  const allDoneToday = todayHabits.length > 0 && todayHabits.every(h => completedTodayIds.has(h.id));
  const maxStreak = Math.max(0, ...Object.values(streaks).filter(s => s >= 7));

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
                  onToggle={() => handleToggle(h)}
                />
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* All Habits */}
      {habits.length === 0 && !loading ? (
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
            {habits.map(h => {
              const streak = streaks[h.id] ?? 0;
              const progress = Math.min(100, Math.round((streak / h.targetStreak) * 100));
              return (
                <button
                  key={h.id}
                  onClick={() => openEdit(h)}
                  className="text-left bg-[#1a1a1f] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all relative overflow-hidden"
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
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <HabitSheet
        open={sheetOpen}
        habit={editingHabit}
        projectOptions={projectOptions}
        onSave={handleSave}
        onArchive={editingHabit ? handleArchive : undefined}
        onClose={() => { setSheetOpen(false); setEditingHabit(null); }}
      />
    </div>
  );
}
