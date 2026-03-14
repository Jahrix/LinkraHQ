import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type Habit, computeHabitStreak, computeHabitBrokenStreak, isHabitDueToday, todayKey } from "@linkra/shared";
import { api } from "./api";
import { supabase } from "./supabase";

interface HabitContextValue {
  habits: Habit[];
  completedTodayIds: Set<string>;
  streaks: Record<string, number>;
  brokenStreaks: Record<string, number>;
  isLoading: boolean;
  refreshHabits: () => Promise<void>;
  toggleHabit: (habit: Habit) => Promise<void>;
  recoverStreak: (habit: Habit) => Promise<void>;
  saveHabit: (data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>, id?: string) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
}

const HabitContext = createContext<HabitContextValue | undefined>(undefined);

export function HabitContextProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [brokenStreaks, setBrokenStreaks] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const today = todayKey();
  const since60 = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 61);
    return d.toISOString().slice(0, 10);
  })();

  const refreshHabits = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setHabits([]);
        setCompletedTodayIds(new Set());
        setStreaks({});
        return;
      }
      const [habitsData, todayIds] = await Promise.all([api.getHabits(), api.getAllCompletionsToday()]);
      setHabits(habitsData);
      setCompletedTodayIds(new Set(todayIds));
      
      const results = await Promise.all(
        habitsData.map(h =>
          api.getHabitCompletions(h.id, since60).then(cs => {
            const dates = cs.map(c => c.date);
            return {
              id: h.id,
              streak: computeHabitStreak(dates),
              brokenStreak: computeHabitBrokenStreak(dates)
            };
          })
        )
      );
      
      const streaksMap: Record<string, number> = {};
      const brokenMap: Record<string, number> = {};
      results.forEach(({ id, streak, brokenStreak }) => { 
        streaksMap[id] = streak;
        if (brokenStreak !== null) {
          brokenMap[id] = brokenStreak;
        }
      });
      setStreaks(streaksMap);
      setBrokenStreaks(brokenMap);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshHabits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run on mount

  const toggleHabit = async (habit: Habit) => {
    const isCompleted = completedTodayIds.has(habit.id);
    
    // Optimistic update
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
    } catch (e) {
      // Revert on error
      console.error(e);
      setCompletedTodayIds(prev => {
        const next = new Set(prev);
        if (isCompleted) next.add(habit.id); else next.delete(habit.id);
        return next;
      });
    }
  };

  const recoverStreak = async (habit: Habit) => {
    // Only valid if there is actually a broken streak
    if (!brokenStreaks[habit.id]) return;
    
    // Set yesterday's date
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    
    try {
      await api.completeHabit(habit.id, yesterday);
      // After backfilling yesterday, the broken streak is recovered!
      // Add it back to the current streak + 1 (for yesterday)
      setStreaks(prev => ({ ...prev, [habit.id]: (prev[habit.id] || 0) + brokenStreaks[habit.id] + 1 }));
      setBrokenStreaks(prev => {
        const next = { ...prev };
        delete next[habit.id];
        return next;
      });
    } catch (e) {
      console.error("Failed to recover streak:", e);
      throw e;
    }
  };

  const saveHabit = async (data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>, id?: string) => {
    try {
      if (id) {
        const updated = await api.updateHabit(id, data);
        setHabits(prev => prev.map(h => (h.id === id ? updated : h)));
      } else {
        const created = await api.createHabit(data as Omit<Habit, "id" | "createdAt" | "updatedAt">);
        setHabits(prev => [created, ...prev]);
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const archiveHabit = async (id: string) => {
    try {
      const updated = await api.updateHabit(id, { archivedAt: new Date().toISOString() });
      setHabits(prev => prev.map(h => (h.id === id ? updated : h)));
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const deleteHabit = async (id: string) => {
    try {
      await api.deleteHabit(id);
      setHabits(prev => prev.filter(h => h.id !== id));
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Find the habit ID: either hovered, or from the currently focused element
      let targetId: string | null | undefined = undefined;
      const hoveredHabit = document.querySelector(":hover[data-habit-id]");
      if (hoveredHabit) {
        targetId = hoveredHabit.getAttribute("data-habit-id");
      }
      if (!targetId && document.activeElement) {
        targetId = document.activeElement.getAttribute("data-habit-id");
      }

      if (!targetId) return;

      const habit = habits.find((h) => h.id === targetId);
      if (!habit) return;

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (window.confirm(`Delete habit "${habit.title}" permanently?`)) {
          deleteHabit(habit.id);
        }
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        if (window.confirm(`Archive habit "${habit.title}"?`)) {
          archiveHabit(habit.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits]);

  return (
    <HabitContext.Provider
      value={{
        habits,
        completedTodayIds,
        streaks,
        brokenStreaks,
        isLoading,
        refreshHabits,
        toggleHabit,
        recoverStreak,
        saveHabit,
        archiveHabit,
        deleteHabit,
      }}
    >
      {children}
    </HabitContext.Provider>
  );
}

export function useHabitContext() {
  const context = useContext(HabitContext);
  if (context === undefined) {
    throw new Error("useHabitContext must be used within a HabitContextProvider");
  }
  return context;
}
