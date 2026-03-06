import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppStateSchema, type AppState } from "@linkra/shared";
import { supabase } from "./supabase";
import { cloneAppState, createDefaultAppState } from "./appStateModel";

interface StateContextValue {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (next: AppState) => Promise<boolean>;
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
        const fresh = createDefaultAppState();
        const { error: insertError } = await supabase.from("user_state").insert({
          user_id: user.id,
          state: fresh,
          updated_at: new Date().toISOString()
        });
        if (insertError) {
          throw insertError;
        }
        setState(fresh);
      } else if (dbError) {
        throw dbError;
      } else {
        setState(AppStateSchema.parse(data.state));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
    } finally {
      setLoading(false);
    }
  };

  const save = async (next: AppState) => {
    const previous = state ? cloneAppState(state) : null;
    const candidate = cloneAppState(next);
    setError(null);
    setState(candidate);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be signed in to save state.");
      }

      const { error: dbError } = await supabase
        .from("user_state")
        .upsert(
          { user_id: user.id, state: candidate, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (dbError) throw dbError;
      broadcastUpdate();
      return true;
    } catch (err) {
      setState(previous);
      setError(err instanceof Error ? err.message : "Failed to save state");
      return false;
    }
  };

  useEffect(() => {
    refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        refresh();
      } else if (event === "SIGNED_OUT") {
        setState(null);
      }
    });

    return () => subscription.unsubscribe();
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
