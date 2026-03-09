import React, { useMemo, useState } from "react";
import { computeGoalMetrics, todayKey, type Goal } from "@linkra/shared";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { formatDate, formatDay } from "../lib/date";
import { useToast } from "../lib/toast";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";
import Pill from "../components/Pill";

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
    return <div className="flex items-center justify-center min-h-[400px] text-muted animate-pulse">Initializing Daily Directive...</div>;
  }
  const todayLabel = formatDay(new Date());
  const totalPoints = todayEntry.goals.reduce((sum, goal) => sum + goal.points, 0);

  const archive = useMemo(
    () => Object.values(state.dailyGoalsByDate).filter((entry) => entry.date !== key).sort((a, b) => b.date.localeCompare(a.date)),
    [state, key]
  );

  const updateGoal = async (goalId: string, done: boolean) => {
    if (!todayEntry) return;
    const next = cloneAppState(state);
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
    const saved = await save(next);
    if (!saved) {
      push("Failed to update goal.", "error");
    }
  };

  const addGoal = async () => {
    if (!title.trim() || !todayEntry) return;
    const now = new Date().toISOString();
    const next = cloneAppState(state);
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
    const saved = await save(next);
    if (!saved) {
      push("Failed to add goal.", "error");
    }
  };

  const addTemplateGoal = async () => {
    if (!templateTitle.trim()) return;
    const now = new Date().toISOString();
    const next = cloneAppState(state);
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
    const saved = await save(next);
    if (saved) {
      push("Elite template updated.");
    } else {
      push("Failed to update template.", "error");
    }
  };

  const removeTemplateGoal = async (id: string) => {
    const next = cloneAppState(state);
    next.userSettings.goalTemplate = next.userSettings.goalTemplate.filter((goal) => goal.id !== id);
    const saved = await save(next);
    if (!saved) {
      push("Failed to remove template.", "error");
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Daily Discipline</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(93,216,255,0.5)]"></span>
            {todayLabel}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-4 rounded-2xl backdrop-blur-xl">
          <div className="text-center">
            <span className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Execution Score</span>
            <span className="text-3xl font-black text-white tabular-nums tracking-tighter">{todayEntry.score}%</span>
          </div>
          <div className="w-[1px] h-10 bg-white/10 mx-2" />
          <div className="text-center">
            <span className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Quota Completed</span>
            <span className="text-3xl font-black text-accent tabular-nums tracking-tighter">{todayEntry.completedPoints} <span className="text-sm text-white/30 uppercase tracking-normal">/ {totalPoints}</span></span>
          </div>
        </div>
      </div>

      <GlassPanel variant="standard" className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <SectionHeader title="Active Quota" subtitle="High-impact daily movements" className="mb-0" />
          <Pill tone="neutral">AUTO-RESETTING</Pill>
        </div>

        <div className="divide-y divide-white/5">
          {todayEntry.goals.length === 0 && <div className="p-12 text-center text-muted italic">No disciplines active for today. Define objectives below.</div>}
          {todayEntry.goals.map((goal) => (
            <div key={goal.id} className={`flex items-center gap-6 p-5 transition-all duration-300 ${goal.done ? "opacity-40 saturate-0" : "hover:bg-white/[0.03]"}`}>
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-lg tracking-tight ${goal.done ? "line-through text-muted" : "text-white/90"}`}>{goal.title}</div>
                <div className="text-xs font-black uppercase tracking-widest text-accent/60 mt-1">{goal.category}</div>
              </div>
              <div className="flex items-center gap-6">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-md border ${goal.done ? "bg-white/5 border-white/5 text-white/20" : "bg-accent/10 border-accent/20 text-accent"}`}>
                  +{goal.points} PTS
                </span>
                <input
                  type="checkbox"
                  checked={goal.done}
                  onChange={(event) => updateGoal(goal.id, event.target.checked)}
                  className="w-6 h-6 cursor-pointer bg-white/5 border border-white/10 rounded-lg checked:bg-accent checked:border-accent transition-all hover:scale-110 active:scale-95"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-white/[0.01] border-t border-white/5">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_200px_100px_auto]">
            <input className="input bg-black/40 border-white/5 focus:border-accent/40" placeholder="Objective name..." value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
            <input className="input bg-black/40 border-white/5 focus:border-accent/40" placeholder="Category (e.g. Focus)" value={category} onChange={(e) => setCategory(e.target.value)} autoComplete="off" />
            <input
              className="input bg-black/40 border-white/5 focus:border-accent/40 text-center font-bold"
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
            <button className="button-secondary px-8 font-black uppercase tracking-widest text-[10px]" onClick={addGoal}>
              Add More
            </button>
          </div>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassPanel variant="standard" className="p-0 flex flex-col h-full">
          <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
            <SectionHeader title="Elite Templates" subtitle="Auto-assigned every midnight" className="mb-0" />
          </div>
          <div className="flex-1 divide-y divide-white/5 overflow-y-auto max-h-[400px]">
            {state.userSettings.goalTemplate.length === 0 && <div className="p-10 text-center text-muted italic text-sm">No recurring disciplines defined.</div>}
            {state.userSettings.goalTemplate.map((goal) => (
              <div key={goal.id} className="flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white/90 truncate">{goal.title}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted/60 mt-0.5">{goal.category} · {goal.points}pts</div>
                </div>
                <button className="p-2 hover:text-red-400 text-muted/30 transition-colors" onClick={() => removeTemplateGoal(goal.id)}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
          <div className="p-5 border-t border-white/5 bg-black/20">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_auto]">
              <input
                className="input text-xs"
                placeholder="Template directive..."
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                autoComplete="off"
              />
              <button className="button-primary px-5 text-[9px] font-black uppercase tracking-widest" onClick={addTemplateGoal}>
                Deploy Template
              </button>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="p-0 flex flex-col h-full">
          <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02]">
            <SectionHeader title="History Archive" subtitle="Performance log of past days" className="mb-0" />
          </div>
          <div className="flex-1 divide-y divide-white/5 overflow-y-auto max-h-[500px]">
            {archive.length === 0 && <div className="p-10 text-center text-muted italic text-sm">Operation history is currently empty.</div>}
            {archive.map((entry) => (
              <div key={entry.date} className="flex items-center justify-between gap-4 p-4 hover:bg-white/[0.02] transition-colors">
                <div>
                  <div className="font-bold text-sm text-white/90">{entry.date}</div>
                  <div className="text-[10px] text-muted/60 uppercase tracking-widest mt-0.5 font-bold">
                    {entry.archivedAt ? `LOGGED ${formatDate(entry.archivedAt)}` : "ACTIVE"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-accent tabular-nums">{entry.score}%</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-wider">{entry.completedPoints} PTS</span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
