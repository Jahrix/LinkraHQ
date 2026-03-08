import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppStateSchema, type AppState } from "@linkra/shared";
import { supabase } from "./supabase";
import { cloneAppState, createDefaultAppState, normalizeRuntimeAppState } from "./appStateModel";

interface StateContextValue {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (next: AppState) => Promise<boolean>;
}

const StateContext = createContext<StateContextValue | null>(null);

function createSyncChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel("linkra-sync");
}

function broadcastUpdate() {
  const channel = createSyncChannel();
  if (!channel) {
    return;
  }
  channel.postMessage("refresh");
  channel.close();
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skipBroadcastRefreshRef = useRef(false);
  const stateRef = useRef<AppState | null>(null);

  // Serial save queue: prevents concurrent saves from clobbering each other.
  // If a save is in-flight and a new one arrives, we coalesce to the latest
  // state and flush it once the current save settles.
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<AppState | null>(null);
  // Forward ref so the finally-block flush can call save without a stale closure.
  const saveRef = useRef<(next: AppState) => Promise<boolean>>(async (_) => false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        stateRef.current = null;
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
        const normalized = normalizeRuntimeAppState(fresh);
        stateRef.current = normalized;
        setState(normalized);
      } else if (dbError) {
        throw dbError;
      } else {
        const parsed = AppStateSchema.parse(data.state);
        const normalized = normalizeRuntimeAppState(parsed);
        stateRef.current = normalized;
        setState(normalized);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (next: AppState): Promise<boolean> => {
    const candidate = normalizeRuntimeAppState(cloneAppState(next));
    setError(null);

    // Optimistic update: reflect the new state in the UI immediately.
    stateRef.current = candidate;
    setState(candidate);

    // If another save is already in-flight, coalesce this into the pending slot.
    // The in-flight save's finally block will flush the latest pending state when done.
    if (isSavingRef.current) {
      pendingSaveRef.current = candidate;
      return true;
    }

    isSavingRef.current = true;
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
      skipBroadcastRefreshRef.current = true;
      broadcastUpdate();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save state");
      // On failure: if no newer pending save is queued, refresh from the server to
      // restore authoritative state. If a pending save is queued, let it run — it
      // may succeed and resolve the inconsistency without a full refresh.
      if (!pendingSaveRef.current) {
        void refresh();
      }
      return false;
    } finally {
      isSavingRef.current = false;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) {
        // Use saveRef to avoid capturing a stale closure of save itself.
        void saveRef.current(pending);
      }
    }
  }, [refresh]);

  // Keep the forward ref current on every render so the finally-block flush always
  // calls the latest version of save.
  saveRef.current = save;

  useEffect(() => {
    refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        refresh();
      } else if (event === "SIGNED_OUT") {
        stateRef.current = null;
        setState(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    const channel = createSyncChannel();
    if (!channel) {
      return;
    }
    channel.onmessage = (event) => {
      if (event.data === "refresh") {
        // Skip refresh triggered by our own save — state is already up to date
        if (skipBroadcastRefreshRef.current) {
          skipBroadcastRefreshRef.current = false;
          return;
        }
        refresh();
      }
    };
    return () => channel.close();
  }, [refresh]);

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
    [state, loading, error, refresh, save]
  );

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useAppState() {
  const context = useContext(StateContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider");
  return context;
}
