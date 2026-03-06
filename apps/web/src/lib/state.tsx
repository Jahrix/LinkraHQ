import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AppState } from "@linkra/shared";
import { supabase } from "./supabase";

interface StateContextValue {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (next: AppState) => Promise<void>;
}

const StateContext = createContext<StateContextValue | null>(null);

// Default state for new users — no backend needed
function defaultState(): AppState {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  return {
    metadata: { schema_version: 1, created_at: now },
    userSettings: {
      theme: "dark",
      accent: "#7c3aed",
      reduceMotion: false,
      startOnLogin: false,
      selectedRepos: [],
      goalTemplate: [
        { id: "g1", title: "Ship one focused task", category: "Build", points: 3, done: false, createdAt: now, completedAt: null },
        { id: "g2", title: "Check GitHub commits", category: "Review", points: 2, done: false, createdAt: now, completedAt: null },
        { id: "g3", title: "Write session log", category: "Reflect", points: 1, done: false, createdAt: now, completedAt: null }
      ],
      repoWatchDirs: [],
      repoScanIntervalMinutes: 15,
      repoExcludePatterns: ["**/node_modules/**", "**/.git/**"],
      gitWatcherEnabled: false,
      disabledInsightRules: [],
      enableDailyBackup: false,
      backupRetentionDays: 14,
      schemaVersion: 1
    },
    projects: [],
    localRepos: [],
    dailyGoalsByDate: {
      [today]: {
        date: today,
        goals: [
          { id: "g1", title: "Ship one focused task", category: "Build", points: 3, done: false, createdAt: now, completedAt: null },
          { id: "g2", title: "Check GitHub commits", category: "Review", points: 2, done: false, createdAt: now, completedAt: null },
          { id: "g3", title: "Write session log", category: "Reflect", points: 1, done: false, createdAt: now, completedAt: null }
        ],
        score: 0,
        completedPoints: 0,
        archivedAt: null
      }
    },
    roadmapCards: [],
    sessionLogs: [],
    focusSessions: [],
    quickCaptures: [],
    journalEntries: [],
    insights: [],
    weeklyReviews: [],
    weeklySnapshots: [],
    todayPlanByDate: {},
    github: { loggedIn: false, user: null, lastSyncAt: null, rateLimit: null }
  } as unknown as AppState;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState(null);
        return;
      }

      const { data, error: dbError } = await supabase
        .from("user_state")
        .select("state")
        .eq("user_id", user.id)
        .single();

      if (dbError && dbError.code === "PGRST116") {
        // No row yet — create with default state
        const fresh = defaultState();
        await supabase.from("user_state").insert({
          user_id: user.id,
          state: fresh,
          updated_at: new Date().toISOString()
        });
        setState(fresh);
      } else if (dbError) {
        throw dbError;
      } else {
        setState(data.state as AppState);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
    } finally {
      setLoading(false);
    }
  };

  const save = async (next: AppState) => {
    setState(next);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: dbError } = await supabase
        .from("user_state")
        .upsert(
          { user_id: user.id, state: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (dbError) throw dbError;
      broadcastUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save state");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel("linkra-sync");
    channel.onmessage = (event) => {
      if (event.data === "refresh") refresh();
    };
    return () => channel.close();
  }, []);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = setTimeout(() => {
      refresh();
      broadcastUpdate();
    }, nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(timeout);
  }, [refresh]);

  const value = useMemo(
    () => ({ state, loading, error, refresh, save }),
    [state, loading, error]
  );

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useAppState() {
  const context = useContext(StateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}

function broadcastUpdate() {
  const channel = new BroadcastChannel("linkra-sync");
  channel.postMessage("refresh");
  channel.close();
}
