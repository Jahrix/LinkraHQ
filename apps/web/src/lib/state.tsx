import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AppState } from "@linkra/shared";
import { api } from "./api";

interface StateContextValue {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (next: AppState) => Promise<void>;
}

const StateContext = createContext<StateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getState();
      setState(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
    } finally {
      setLoading(false);
    }
  };

  const save = async (next: AppState) => {
    setState(next);
    try {
      const result = await api.saveState(next);
      setState(result.state);
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
      if (event.data === "refresh") {
        refresh();
      }
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
    () => ({
      state,
      loading,
      error,
      refresh,
      save
    }),
    [state, loading, error]
  );

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useAppState() {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}

function broadcastUpdate() {
  const channel = new BroadcastChannel("linkra-sync");
  channel.postMessage("refresh");
  channel.close();
}
