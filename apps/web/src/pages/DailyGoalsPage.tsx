import React, { useMemo, useState } from "react";
import { computeGoalMetrics, todayKey, type Goal } from "@linkra/shared";
import { useAppState } from "../lib/state";
import { formatDate } from "../lib/date";
import { useToast } from "../lib/toast";

export default function DailyGoalsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Focus");
  const [points, setPoints] = useState(1);

  const [templateTitle, setTemplateTitle] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Focus");
  const [templatePoints, setTemplatePoints] = useState(1);

  if (!state) return null;
  const key = todayKey();
  const todayEntry = state.dailyGoalsByDate[key];
  if (!todayEntry) {
    return <div className="glass panel">Loading today&#39;s goals...</div>;
  }

  const archive = useMemo(
    () => Object.values(state.dailyGoalsByDate).filter((entry) => entry.date !== key),
    [state, key]
  );

  const updateGoal = async (goalId: string, done: boolean) => {
    if (!todayEntry) return;
    const next = { ...state };
    const entry = next.dailyGoalsByDate[key];
    entry.goals = entry.goals.map((goal) =>
      goal.id === goalId
        ? {
            ...goal,
            done,
            completedAt: done ? new Date().toISOString() : null
          }
        : goal
    );
    const metrics = computeGoalMetrics(entry.goals);
    entry.completedPoints = metrics.completedPoints;
    entry.score = metrics.score;
    await save(next);
  };

  const addGoal = async () => {
    if (!title.trim() || !todayEntry) return;
    const now = new Date().toISOString();
    const next = { ...state };
    const entry = next.dailyGoalsByDate[key];
    const goal: Goal = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category,
      points,
      done: false,
      createdAt: now,
      completedAt: null
    };
    entry.goals = [goal, ...entry.goals];
    const metrics = computeGoalMetrics(entry.goals);
    entry.completedPoints = metrics.completedPoints;
    entry.score = metrics.score;
    setTitle("");
    await save(next);
  };

  const addTemplateGoal = async () => {
    if (!templateTitle.trim()) return;
    const now = new Date().toISOString();
    const next = { ...state };
    next.userSettings.goalTemplate = [
      {
        id: crypto.randomUUID(),
        title: templateTitle.trim(),
        category: templateCategory,
        points: templatePoints,
        done: false,
        createdAt: now,
        completedAt: null
      },
      ...next.userSettings.goalTemplate
    ];
    setTemplateTitle("");
    await save(next);
    push("Template updated.");
  };

  const removeTemplateGoal = async (id: string) => {
    const next = { ...state };
    next.userSettings.goalTemplate = next.userSettings.goalTemplate.filter((goal) => goal.id !== id);
    await save(next);
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="glass panel">
        <h3>Today&#39;s Goals</h3>
        <div className="table" style={{ marginTop: 12 }}>
          {todayEntry.goals.map((goal) => (
            <label key={goal.id} className="table-row" style={{ cursor: "pointer" }}>
              <div>
                <strong>{goal.title}</strong>
                <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{goal.category}</div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="chip">{goal.points} pts</span>
                <input
                  type="checkbox"
                  checked={goal.done}
                  onChange={(event) => updateGoal(goal.id, event.target.checked)}
                />
              </div>
            </label>
          ))}
        </div>
        <div className="input-inline" style={{ marginTop: 16 }}>
          <input className="input" placeholder="New goal" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input
            className="input"
            type="number"
            min={1}
            style={{ width: 100 }}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
          <button className="button-primary" onClick={addGoal}>
            Add
          </button>
        </div>
      </div>

      <div className="glass panel">
        <h3>Template Goals</h3>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          These auto-populate each morning at midnight.
        </p>
        <div className="table" style={{ marginTop: 12 }}>
          {state.userSettings.goalTemplate.map((goal) => (
            <div key={goal.id} className="table-row">
              <div>
                <strong>{goal.title}</strong>
                <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{goal.category}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="chip">{goal.points} pts</span>
                <button className="button-secondary" onClick={() => removeTemplateGoal(goal.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="input-inline" style={{ marginTop: 16 }}>
          <input
            className="input"
            placeholder="Template goal"
            value={templateTitle}
            onChange={(e) => setTemplateTitle(e.target.value)}
          />
          <input
            className="input"
            placeholder="Category"
            value={templateCategory}
            onChange={(e) => setTemplateCategory(e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={1}
            style={{ width: 100 }}
            value={templatePoints}
            onChange={(e) => setTemplatePoints(Number(e.target.value))}
          />
          <button className="button-primary" onClick={addTemplateGoal}>
            Add Template
          </button>
        </div>
      </div>

      <div className="glass panel">
        <h3>Archive</h3>
        <div className="table" style={{ marginTop: 12 }}>
          {archive.length === 0 && <p style={{ color: "var(--muted)" }}>No archived days yet.</p>}
          {archive.map((entry) => (
            <div key={entry.date} className="table-row">
              <div>
                <strong>{entry.date}</strong>
                <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                  Archived {entry.archivedAt ? formatDate(entry.archivedAt) : "—"}
                </div>
              </div>
              <span className="chip">Score {entry.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
