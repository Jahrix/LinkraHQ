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
        completedAt: now
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
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card-grid cols-2">
        <div className="glass panel focus-timer">
          <h3>Focus Timer</h3>
          <div className="focus-display">
            {minutesDisplay}:{secondsDisplay}
          </div>
          <div className="filter-row">
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
            <span className="chip">minutes</span>
          </div>
          <div className="filter-row">
            <button className="button-primary" onClick={() => setRunning((prev) => !prev)}>
              {running ? "Pause" : "Start"}
            </button>
            <button className="button-secondary" onClick={resetTimer}>
              Reset
            </button>
          </div>
          <p style={{ color: "var(--muted)" }}>Completed sessions: {state.focusSessions.length}</p>
        </div>

        <div className="glass panel">
          <h3>Session Log</h3>
          <div className="table" style={{ marginTop: 12 }}>
            {state.sessionLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="table-row">
                <div>
                  <strong>{log.text}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{formatTime(log.ts)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="input-inline" style={{ marginTop: 12 }}>
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

      <QuickCapture />
    </div>
  );
}
