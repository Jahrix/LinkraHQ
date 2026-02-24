import React, { useMemo, useState } from "react";
import { useAppState } from "../lib/state";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { isTaskBlocked } from "../lib/taskRules";

function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = date.getDate() - day;
  const start = new Date(date);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

export default function WeeklyReviewPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [markdown, setMarkdown] = useState("");
  const [stats, setStats] = useState<any>(null);

  const review = useMemo(() => state?.weeklyReviews[0], [state]);

  if (!state) return null;

  const perProject =
    review?.perProject?.length
      ? review.perProject.map((entry) => ({
          id: entry.projectId,
          name: entry.projectName,
          tasksDone: entry.tasksDone,
          tasksTotal: entry.tasksCreated,
          commits: entry.commitsCount
        }))
      : state.projects.map((project) => {
          const tasksDone = project.tasks.filter((t) => t.done).length;
          const tasksTotal = project.tasks.length;
          const repo = state.localRepos.find((r) => r.path === project.localRepoPath);
          return {
            id: project.id,
            name: project.name,
            tasksDone,
            tasksTotal,
            commits: repo?.todayCommitCount ?? 0
          };
        });

  const shippedTasks = state.projects.flatMap((project) =>
    project.tasks.filter((task) => task.done).map((task) => `${project.name}: ${task.text}`)
  );

  const blockedTasks = state.projects.flatMap((project) =>
    project.tasks
      .filter((task) => isTaskBlocked(task, project.tasks))
      .map((task) => `${project.name}: ${task.text}`)
  );

  const generateReview = async () => {
    const result = await api.weeklyGenerate(weekStart);
    setMarkdown(result.review.markdown);
    setStats(result.review.stats);
  };

  const closeWeek = async () => {
    const result = await api.weeklyClose(weekStart);
    await save(result.state);
    setMarkdown(result.review.markdown);
    setStats(result.review.stats);
    push("Week closed.");
  };

  const copyMarkdown = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    push("Markdown copied.");
  };

  const exportSnapshot = () => {
    const data = {
      weekStart,
      markdown,
      stats
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkra-weekly-${weekStart}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Weekly Review</p>
          <h2 className="text-lg font-semibold">Auto recap</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-[180px_auto_auto]">
          <input
            className="input"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
          <button className="button-primary" onClick={generateReview}>
            Generate Markdown
          </button>
          <button className="button-secondary" onClick={closeWeek}>
            Close Week
          </button>
        </div>
      </div>

      <div className="panel space-y-3">
        <h3 className="text-base font-semibold">Stats</h3>
        {stats ? (
          <div className="table">
            <div className="table-row">Goals completed: {stats.goalsCompleted}</div>
            <div className="table-row">Points: {stats.points}</div>
            <div className="table-row">Tasks done: {stats.tasksDone}</div>
            <div className="table-row">Tasks created: {stats.tasksCreated}</div>
            <div className="table-row">Roadmap moved: {stats.roadmapMoved}</div>
            <div className="table-row">Commits: {stats.commitsCount}</div>
            <div className="table-row">Focus minutes: {stats.focusMinutes}</div>
            <div className="table-row">Journal entries: {stats.journalCount}</div>
            <div className="table-row">Streak delta: {stats.streakDelta}</div>
          </div>
        ) : (
          <p className="text-sm text-white/60">Generate a review to see stats.</p>
        )}
      </div>

      <div className="panel space-y-3">
        <h3 className="text-base font-semibold">Per-project Breakdown</h3>
        <div className="table">
          {perProject.map((row) => (
            <div key={row.id} className="table-row">
              <span>{row.name}</span>
              <span className="text-xs text-white/60">Tasks {row.tasksDone}/{row.tasksTotal}</span>
              <span className="text-xs text-white/60">Commits {row.commits}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel space-y-3">
        <h3 className="text-base font-semibold">Shipped / Done</h3>
        {shippedTasks.length === 0 && <p className="text-sm text-white/60">No completed tasks yet.</p>}
        <ul className="list-disc pl-5 text-sm text-white/70">
          {shippedTasks.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="panel space-y-3">
        <h3 className="text-base font-semibold">Still Blocked</h3>
        {blockedTasks.length === 0 && <p className="text-sm text-white/60">No blocked tasks.</p>}
        <ul className="list-disc pl-5 text-sm text-white/70">
          {blockedTasks.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Markdown Recap</h3>
          <div className="flex gap-2">
            <button className="button-secondary" onClick={copyMarkdown}>
              Copy Markdown
            </button>
            <button className="button-secondary" onClick={exportSnapshot}>
              Export JSON Snapshot
            </button>
          </div>
        </div>
        <textarea
          className="input"
          rows={12}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder="Generate a weekly review to see markdown."
        />
      </div>
    </div>
  );
}
