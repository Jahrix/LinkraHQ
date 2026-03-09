import React, { useEffect, useState } from "react";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { formatTime } from "../lib/date";
import QuickCapture from "../components/QuickCapture";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";

const DEFAULT_MINUTES = 25;
const TIMER_STORAGE_KEY = "linkra:tools-pomodoro";

interface StoredPomodoroTimer {
  minutes: number;
  secondsLeft: number;
  running: boolean;
  startPresses: number;
  completedCount: number;
  endsAt: number | null;
}

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_MINUTES;
  return Math.min(90, Math.max(5, Math.floor(value)));
}

function readStoredTimer(): StoredPomodoroTimer {
  const fallback: StoredPomodoroTimer = {
    minutes: DEFAULT_MINUTES,
    secondsLeft: DEFAULT_MINUTES * 60,
    running: false,
    startPresses: 0,
    completedCount: 0,
    endsAt: null
  };
  const storage = getSessionStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredPomodoroTimer>;
    const minutes = clampMinutes(parsed.minutes ?? DEFAULT_MINUTES);
    const running = Boolean(parsed.running);
    const endsAt = typeof parsed.endsAt === "number" ? parsed.endsAt : null;
    const computedSeconds =
      running && endsAt
        ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
        : Math.max(0, Math.floor(parsed.secondsLeft ?? minutes * 60));

    return {
      minutes,
      secondsLeft: computedSeconds,
      running: running && computedSeconds > 0,
      startPresses: Math.max(0, Math.floor(parsed.startPresses ?? 0)),
      completedCount: Math.max(0, Math.floor(parsed.completedCount ?? 0)),
      endsAt: running && computedSeconds > 0 ? endsAt : null
    };
  } catch {
    return fallback;
  }
}

export default function ToolsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [timerState, setTimerState] = useState<StoredPomodoroTimer>(() => readStoredTimer());
  const [sessionText, setSessionText] = useState("");
  const [timerDisabled, setTimerDisabled] = useState(false);

  const { minutes, secondsLeft, running, startPresses, completedCount, endsAt } = timerState;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setTimerState((prev) => {
        const remaining = prev.endsAt ? Math.max(0, Math.ceil((prev.endsAt - Date.now()) / 1000)) : Math.max(0, prev.secondsLeft - 1);
        if (remaining === prev.secondsLeft) return prev;
        return {
          ...prev,
          secondsLeft: remaining,
          running: remaining > 0 && prev.running,
          endsAt: remaining > 0 ? prev.endsAt : null
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (secondsLeft <= 0 && running) {
      completeSession();
    }
  }, [secondsLeft, running]);

  useEffect(() => {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerState));
  }, [timerState]);

  if (!state) return null;

  const resetTimer = () => {
    setTimerState((prev) => ({
      ...prev,
      running: false,
      secondsLeft: prev.minutes * 60,
      endsAt: null
    }));
  };

  const toggleTimer = () => {
    if (timerDisabled) {
      push("Button rate limited. Please wait.", "warning");
      return;
    }
    setTimerDisabled(true);
    setTimeout(() => setTimerDisabled(false), 1500);

    setTimerState((prev) => {
      if (prev.running) {
        const remaining = prev.endsAt ? Math.max(0, Math.ceil((prev.endsAt - Date.now()) / 1000)) : prev.secondsLeft;
        return {
          ...prev,
          running: false,
          secondsLeft: remaining,
          endsAt: null
        };
      }

      return {
        ...prev,
        running: true,
        startPresses: prev.startPresses + 1,
        endsAt: Date.now() + prev.secondsLeft * 1000
      };
    });
  };

  const completeSession = async () => {
    setTimerState((prev) => ({
      ...prev,
      running: false,
      secondsLeft: prev.minutes * 60,
      completedCount: prev.completedCount + 1,
      endsAt: null
    }));
    const now = new Date().toISOString();
    const next = cloneAppState(state);
    next.focusSessions = [
      {
        id: crypto.randomUUID(),
        startedAt: new Date(Date.now() - minutes * 60000).toISOString(),
        durationMinutes: minutes,
        completedAt: now,
        planned: false,
        projectId: null,
        reason: "Timer"
      },
      ...next.focusSessions
    ];
    next.sessionLogs = [
      {
        id: crypto.randomUUID(),
        ts: now,
        text: `Focus session complete (${minutes}m)`,
        project: null,
        tags: []
      },
      ...next.sessionLogs
    ];
    const saved = await save(next);
    if (!saved) {
      push("Session recorded but failed to save. Data may be lost on refresh.", "error");
    }
  };

  const addSessionLog = async () => {
    if (!sessionText.trim()) return;
    const now = new Date().toISOString();
    const next = cloneAppState(state);
    next.sessionLogs = [
      {
        id: crypto.randomUUID(),
        ts: now,
        text: sessionText.trim(),
        project: null,
        tags: []
      },
      ...next.sessionLogs
    ];
    setSessionText("");
    const saved = await save(next);
    if (!saved) {
      push("Failed to save session log.", "error");
    }
  };

  const minutesDisplay = Math.floor(secondsLeft / 60);
  const secondsDisplay = String(secondsLeft % 60).padStart(2, "0");
  const completedSessions = completedCount;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Command Tools</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(93,216,255,0.5)]"></span>
            Active Utilities
          </p>
        </div>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel variant="standard" className="space-y-4 p-6">
          <SectionHeader 
            eyebrow="Focus Timer" 
            title="Pomodoro session" 
            rightControls={<span className="chip">{completedSessions} completed</span>} 
          />
          <div className="focus-display">
            {minutesDisplay}:{secondsDisplay}
          </div>
          <div className="grid gap-2 md:grid-cols-[120px_auto]">
            <input
              className="input"
              type="number"
              min={5}
              max={90}
              value={minutes}
              onChange={(event) => {
                const value = clampMinutes(Number(event.target.value));
                setTimerState((prev) => ({
                  ...prev,
                  minutes: value,
                  secondsLeft: value * 60,
                  running: false,
                  endsAt: null
                }));
              }}
            />
            <span className="chip self-center">minutes</span>
          </div>
          <div className="filter-row">
            <button 
              className={`button-primary ${timerDisabled ? "opacity-50 cursor-not-allowed" : ""}`} 
              onClick={toggleTimer}
            >
              {running ? "Pause" : "Start"}
            </button>
            <button className="button-secondary" onClick={resetTimer}>
              Reset
            </button>
          </div>
          <p className="text-sm text-muted">Completed: {completedSessions} · Started: {startPresses} times</p>
        </GlassPanel>

        <GlassPanel variant="standard" className="space-y-4 p-6">
          <SectionHeader 
            eyebrow="Session Log" 
            title="What you did" 
          />
          <div className="table">
            {state.sessionLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="table-row">
                <div>
                  <strong>{log.text}</strong>
                  <div className="text-xs text-muted">{formatTime(log.ts)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              className="input"
              placeholder="What did you just do?"
              value={sessionText}
              onChange={(e) => setSessionText(e.target.value)}
              autoComplete="off"
            />
            <button className="button-primary" onClick={addSessionLog}>
              Log
            </button>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel variant="standard" className="space-y-4 p-6">
        <SectionHeader 
          eyebrow="Planned Focus" 
          title="Queued sessions" 
        />
        <div className="table">
          {state.focusSessions.filter((s) => s.planned).length === 0 && (
            <p className="text-sm text-muted">No planned sessions.</p>
          )}
          {state.focusSessions
            .filter((s) => s.planned)
            .slice(0, 6)
            .map((session) => (
              <div key={session.id} className="table-row">
                <div>
                  <strong>{session.durationMinutes}m focus</strong>
                  <div className="text-xs text-muted">{session.reason ?? "Insight"}</div>
                </div>
              </div>
            ))}
        </div>
      </GlassPanel>

      <QuickCapture />
    </div>
  );
}
