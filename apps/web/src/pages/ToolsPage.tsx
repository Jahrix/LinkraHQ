import React, { useEffect, useState } from "react";
import { useAppState } from "../lib/state";
import { formatTime } from "../lib/date";
import QuickCapture from "../components/QuickCapture";

const DEFAULT_MINUTES = 25;

export default function ToolsPage() {
  const { state, save } = useAppState();
  const [sessionText, setSessionText] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_MINUTES * 60);
  const [running, setRunning] = useState(false);

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

  const completeSession = async () => {
    setRunning(false);
    const now = new Date().toISOString();
    const next = { ...state };
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
    await save(next);
    setSecondsLeft(minutes * 60);
  };

  const addSessionLog = async () => {
    if (!sessionText.trim()) return;
    const now = new Date().toISOString();
    const next = { ...state };
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
    await save(next);
  };

  const minutesDisplay = Math.floor(secondsLeft / 60);
  const secondsDisplay = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Focus Timer</p>
              <h2 className="text-lg font-semibold">Pomodoro session</h2>
            </div>
            <span className="chip">{state.focusSessions.length} sessions</span>
          </div>
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
            <button className="button-primary" onClick={() => setRunning((prev) => !prev)}>
              {running ? "Pause" : "Start"}
            </button>
            <button className="button-secondary" onClick={resetTimer}>
              Reset
            </button>
          </div>
          <p className="text-sm text-white/60">Completed sessions: {state.focusSessions.length}</p>
        </div>

        <div className="panel space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Session Log</p>
            <h2 className="text-lg font-semibold">What you did</h2>
          </div>
          <div className="table">
            {state.sessionLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="table-row">
                <div>
                  <strong>{log.text}</strong>
                  <div className="text-xs text-white/60">{formatTime(log.ts)}</div>
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
            />
            <button className="button-primary" onClick={addSessionLog}>
              Log
            </button>
          </div>
        </div>
      </div>

      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Planned Focus</p>
          <h2 className="text-lg font-semibold">Queued sessions</h2>
        </div>
        <div className="table">
          {state.focusSessions.filter((s) => s.planned).length === 0 && (
            <p className="text-sm text-white/60">No planned sessions.</p>
          )}
          {state.focusSessions
            .filter((s) => s.planned)
            .slice(0, 6)
            .map((session) => (
              <div key={session.id} className="table-row">
                <div>
                  <strong>{session.durationMinutes}m focus</strong>
                  <div className="text-xs text-white/60">{session.reason ?? "Insight"}</div>
                </div>
              </div>
            ))}
        </div>
      </div>

      <QuickCapture />
    </div>
  );
}
