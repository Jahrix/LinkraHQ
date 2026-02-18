import React from "react";
import { computeStreak, todayKey } from "@linkra/shared";
import { useAppState } from "../lib/state";
import QuickCapture from "../components/QuickCapture";
import { formatDate } from "../lib/date";

export default function DashboardPage() {
  const { state } = useAppState();

  if (!state) return null;

  const today = state.dailyGoalsByDate[todayKey()];
  const completed = today ? today.goals.filter((goal) => goal.done).length : 0;
  const total = today ? today.goals.length : 0;
  const streak = computeStreak(Object.values(state.dailyGoalsByDate));

  const latestLogs = [...state.sessionLogs].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 4);
  const latestRoadmap = [...state.roadmapCards].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 4);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card-grid cols-3">
        <div className="glass panel">
          <div className="badge">Today</div>
          <h3 style={{ marginTop: 10 }}>Lock-in Score</h3>
          <p style={{ fontSize: "2rem", fontWeight: 600 }}>{today?.score ?? 0}</p>
        </div>
        <div className="glass panel">
          <div className="badge">Streak</div>
          <h3 style={{ marginTop: 10 }}>Consistency</h3>
          <p style={{ fontSize: "2rem", fontWeight: 600 }}>{streak} days</p>
        </div>
        <div className="glass panel">
          <div className="badge">Goals</div>
          <h3 style={{ marginTop: 10 }}>Completed</h3>
          <p style={{ fontSize: "2rem", fontWeight: 600 }}>
            {completed}/{total}
          </p>
        </div>
      </div>

      <QuickCapture />

      <div className="card-grid cols-2">
        <div className="glass panel">
          <h3>Latest Activity</h3>
          <div className="table" style={{ marginTop: 12 }}>
            {latestLogs.length === 0 && <p style={{ color: "var(--muted)" }}>No session logs yet.</p>}
            {latestLogs.map((log) => (
              <div key={log.id} className="table-row">
                <div>
                  <strong>{log.text}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{formatDate(log.ts)}</div>
                </div>
                {log.project && <span className="chip">{log.project}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="glass panel">
          <h3>Roadmap Changes</h3>
          <div className="table" style={{ marginTop: 12 }}>
            {latestRoadmap.length === 0 && <p style={{ color: "var(--muted)" }}>No roadmap cards yet.</p>}
            {latestRoadmap.map((card) => (
              <div key={card.id} className="table-row">
                <div>
                  <strong>{card.title}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{card.lane.toUpperCase()}</div>
                </div>
                <span className="chip">{card.project ?? "General"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass panel">
        <h3>GitHub Status</h3>
        <p style={{ marginTop: 8, color: "var(--muted)" }}>
          {state.github.loggedIn
            ? `Connected as ${state.github.user?.login ?? "GitHub user"}.`
            : "Not connected. Connect in Settings to see commits."}
        </p>
        <p style={{ marginTop: 6 }}>Selected repos: {state.userSettings.selectedRepos.length}</p>
      </div>
    </div>
  );
}
