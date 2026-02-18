import React, { useMemo, useState } from "react";
import { computeGoalMetrics, todayKey, type Goal } from "@linkra/shared";
import { useAppState } from "../lib/state";
import { formatDate, formatDay } from "../lib/date";
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
    return <div className="panel">Loading today&#39;s goals...</div>;
  }
  const todayLabel = formatDay(new Date());
  const totalPoints = todayEntry.goals.reduce((sum, goal) => sum + goal.points, 0);

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
    <div className="space-y-6">
      <div className="panel space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Daily Goals</p>
            <h2 className="text-lg font-semibold">{todayLabel}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="pill">Auto-synced</span>
            <span className="chip">
              {todayEntry.completedPoints}/{totalPoints} pts
            </span>
            <span className="chip">Score {todayEntry.score}%</span>
          </div>
        </div>
        <div className="table">
          {todayEntry.goals.map((goal) => (
            <label key={goal.id} className="table-row hover-lift cursor-pointer">
              <div className="flex flex-col gap-1">
                <strong>{goal.title}</strong>
                <div className="text-xs text-white/60">{goal.category}</div>
              </div>
              <div className="flex items-center gap-3">
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
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_120px_auto]">
          <input className="input" placeholder="New goal" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input
            className="input"
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
          <button className="button-primary" onClick={addGoal}>
            Add Goal
          </button>
        </div>
      </div>

      <div className="panel space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Template Goals</p>
            <h3 className="text-base font-semibold">Midnight auto-rollover</h3>
          </div>
          <span className="chip">{state.userSettings.goalTemplate.length} templates</span>
        </div>
        <div className="table">
          {state.userSettings.goalTemplate.map((goal) => (
            <div key={goal.id} className="table-row">
              <div className="flex flex-col gap-1">
                <strong>{goal.title}</strong>
                <div className="text-xs text-white/60">{goal.category}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="chip">{goal.points} pts</span>
                <button className="button-secondary" onClick={() => removeTemplateGoal(goal.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_120px_auto]">
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
            value={templatePoints}
            onChange={(e) => setTemplatePoints(Number(e.target.value))}
          />
          <button className="button-primary" onClick={addTemplateGoal}>
            Add Template
          </button>
        </div>
      </div>

      <div className="panel space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Archive</p>
            <h3 className="text-base font-semibold">Past days</h3>
          </div>
          <span className="chip">{archive.length} days</span>
        </div>
        <div className="table">
          {archive.length === 0 && <p className="text-sm text-white/60">No archived days yet.</p>}
          {archive.map((entry) => (
            <div key={entry.date} className="table-row">
              <div>
                <strong>{entry.date}</strong>
                <div className="text-xs text-white/60">
                  Archived {entry.archivedAt ? formatDate(entry.archivedAt) : "—"}
                </div>
              </div>
              <span className="chip">Score {entry.score}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
