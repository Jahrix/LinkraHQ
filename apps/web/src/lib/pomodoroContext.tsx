import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface PomodoroTask {
  taskId: string;
  taskText: string;
  projectName: string;
}

export type PomodoroStatus = "idle" | "running" | "paused" | "done";

interface PomodoroContextValue {
  status: PomodoroStatus;
  task: PomodoroTask | null;
  secondsLeft: number;
  startPomodoro: (task: PomodoroTask) => void;
  pausePomodoro: () => void;
  resumePomodoro: () => void;
  stopPomodoro: () => void;
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

const DURATION = 25 * 60;

function playDoneSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.8);
  } catch {
    // AudioContext not available
  }
}

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PomodoroStatus>("idle");
  const [task, setTask] = useState<PomodoroTask | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DURATION);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const startTick = () => {
    clearTick();
    tickRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTick();
          playDoneSound();
          setStatus("done");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startPomodoro = useCallback((newTask: PomodoroTask) => {
    clearTick();
    setTask(newTask);
    setSecondsLeft(DURATION);
    setStatus("running");
    // startTick cannot be called from callback directly due to stale closure,
    // so we use a flag and let a useEffect handle it.
  }, []);

  const pausePomodoro = useCallback(() => {
    clearTick();
    setStatus("paused");
  }, []);

  const resumePomodoro = useCallback(() => {
    setStatus("running");
  }, []);

  const stopPomodoro = useCallback(() => {
    clearTick();
    setTask(null);
    setSecondsLeft(DURATION);
    setStatus("idle");
  }, []);

  // Drive the tick whenever status becomes "running"
  useEffect(() => {
    if (status === "running") {
      startTick();
    } else {
      clearTick();
    }
    return clearTick;
  }, [status]);

  useEffect(() => {
    return clearTick;
  }, []);

  return (
    <PomodoroContext.Provider value={{ status, task, secondsLeft, startPomodoro, pausePomodoro, resumePomodoro, stopPomodoro }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error("usePomodoro must be used within PomodoroProvider");
  return ctx;
}
