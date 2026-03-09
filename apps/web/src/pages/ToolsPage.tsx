import React, { useEffect, useState } from "react";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { formatTime } from "../lib/date";
import QuickCapture from "../components/QuickCapture";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";

const DEFAULT_MINUTES = 25;

export default function ToolsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [sessionText, setSessionText] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [startPresses, setStartPresses] = useState(0);
  const [localCompletedCount, setLocalCompletedCount] = useState(0);
  const [timerDisabled, setTimerDisabled] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (secondsLeft <= 0 && running) {
      completeSession();
    }
  }, [secondsLeft, running]);

  if (!state) return null;

  const resetTimer = () => {
    setRunning(false);
    setSecondsLeft(minutes * 60);
  };

  const toggleTimer = () => {
    if (timerDisabled) {
      push("Button rate limited. Please wait.", "warning");
      return;
    }
    setTimerDisabled(true);
    setTimeout(() => setTimerDisabled(false), 1500);
    
    if (!running) {
      setStartPresses((c) => c + 1);
    }
    setRunning(!running);
  };

  const completeSession = async () => {
    setRunning(false);
    setLocalCompletedCount(c => c + 1);
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
    setSecondsLeft(minutes * 60);
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
  const completedSessions = localCompletedCount;

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
                const value = Number(event.target.value);
                setMinutes(value);
                setSecondsLeft(value * 60);
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
