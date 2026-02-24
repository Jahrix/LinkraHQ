import React, { useMemo, useState } from "react";
import { useAppState } from "../lib/state";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { isTaskBlocked } from "../lib/taskRules";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";
import Pill from "../components/Pill";

function startOfWeek(date: Date) {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function inRange(dateString: string | null | undefined, weekStart: string, weekEnd: string) {
  if (!dateString) return false;
  const day = dateString.slice(0, 10);
  return day >= weekStart && day <= weekEnd;
}

function resolveRoadmapProjectId(ref: string | null, projects: { id: string; name: string }[]) {
  if (!ref) return null;
  const byId = projects.find((project) => project.id === ref);
  if (byId) return byId.id;
  const byName = projects.find((project) => project.name === ref);
  return byName?.id ?? null;
}

export default function WeeklyReviewPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [markdown, setMarkdown] = useState("");
  const [stats, setStats] = useState<{
    goalsCompleted: number;
    points: number;
    tasksDone: number;
    tasksCreated: number;
    roadmapMoved: number;
    commitsCount: number;
    focusMinutes: number;
    journalCount: number;
    streakDelta: number;
  } | null>(null);

  if (!state) return null;

  const weekEnd = addDays(weekStart, 6);

  const computedStats = useMemo(() => {
    const dailyEntries = Object.values(state.dailyGoalsByDate).filter((entry) =>
      inRange(entry.date, weekStart, weekEnd)
    );
    const goalsCompleted = dailyEntries.reduce(
      (sum, entry) => sum + entry.goals.filter((goal) => goal.done).length,
      0
    );
    const points = dailyEntries.reduce((sum, entry) => sum + entry.completedPoints, 0);

    const tasksDone = state.projects.reduce(
      (sum, project) => sum + project.tasks.filter((task) => inRange(task.completedAt, weekStart, weekEnd)).length,
      0
    );
    const tasksCreated = state.projects.reduce(
      (sum, project) => sum + project.tasks.filter((task) => inRange(task.createdAt, weekStart, weekEnd)).length,
      0
    );

    const roadmapMoved = state.roadmapCards.filter((card) => inRange(card.updatedAt, weekStart, weekEnd)).length;
    const commitsCount = state.localRepos.reduce((sum, repo) => sum + repo.todayCommitCount, 0);
    const focusMinutes = state.focusSessions
      .filter((session) => inRange(session.completedAt ?? session.startedAt, weekStart, weekEnd))
      .reduce((sum, session) => sum + session.durationMinutes, 0);
    const journalCount = state.journalEntries.filter((entry) => inRange(entry.ts, weekStart, weekEnd)).length;
    const streakDelta = dailyEntries.filter((entry) => entry.score >= 80).length;

    return {
      goalsCompleted,
      points,
      tasksDone,
      tasksCreated,
      roadmapMoved,
      commitsCount,
      focusMinutes,
      journalCount,
      streakDelta
    };
  }, [state, weekStart, weekEnd]);

  const perProject = useMemo(() => {
    return state.projects.map((project) => {
      const tasksDone = project.tasks.filter((task) => inRange(task.completedAt, weekStart, weekEnd)).length;
      const tasksCreated = project.tasks.filter((task) => inRange(task.createdAt, weekStart, weekEnd)).length;
      const roadmapMoved = state.roadmapCards.filter((card) => {
        const projectId = resolveRoadmapProjectId(card.project, state.projects);
        return projectId === project.id && inRange(card.updatedAt, weekStart, weekEnd);
      }).length;
      const commits = state.localRepos.find((repo) => repo.path === project.localRepoPath)?.todayCommitCount ?? 0;
      const journal = state.journalEntries.filter(
        (entry) => entry.projectId === project.id && inRange(entry.ts, weekStart, weekEnd)
      ).length;

      return {
        id: project.id,
        name: project.name,
        tasksDone,
        tasksCreated,
        roadmapMoved,
        commits,
        journal
      };
    });
  }, [state, weekStart, weekEnd]);

  const highlights = [
    `${computedStats.goalsCompleted} goals completed`,
    `${computedStats.tasksDone} tasks shipped`,
    `${computedStats.focusMinutes} focus minutes`,
    `${computedStats.roadmapMoved} roadmap moves`
  ];

  const generateMarkdownClient = () => {
    const lines: string[] = [];
    lines.push(`# Weekly Review (${weekStart} to ${weekEnd})`);
    lines.push("");
    lines.push("## Highlights");
    highlights.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
    lines.push("## Stats");
    lines.push(`- Goals completed: ${computedStats.goalsCompleted}`);
    lines.push(`- Points earned: ${computedStats.points}`);
    lines.push(`- Tasks done: ${computedStats.tasksDone}`);
    lines.push(`- Tasks created: ${computedStats.tasksCreated}`);
    lines.push(`- Roadmap moved: ${computedStats.roadmapMoved}`);
    lines.push(`- Commits: ${computedStats.commitsCount}`);
    lines.push(`- Focus minutes: ${computedStats.focusMinutes}`);
    lines.push(`- Journal entries: ${computedStats.journalCount}`);
    lines.push("");
    lines.push("## Per Project");

    state.projects.forEach((project) => {
      const doneThisWeek = project.tasks.filter((task) => inRange(task.completedAt, weekStart, weekEnd));
      const blockers = project.tasks.filter((task) => !task.done && isTaskBlocked(task, project.tasks));
      const nextTasks = project.tasks.filter((task) => !task.done).slice(0, 3);
      const localRepo = state.localRepos.find((repo) => repo.path === project.localRepoPath);

      lines.push(`### ${project.icon} ${project.name}`);
      if (doneThisWeek.length === 0) {
        lines.push("- What shipped: none logged this week");
      } else {
        lines.push(`- What shipped: ${doneThisWeek.slice(0, 4).map((task) => task.text).join("; ")}`);
      }
      lines.push(`- Key commits: ${localRepo?.todayCommitCount ?? 0} recent local commits`);
      lines.push(`- Blockers: ${blockers.length ? blockers.slice(0, 3).map((task) => task.text).join("; ") : "none"}`);
      lines.push(`- Next: ${nextTasks.length ? nextTasks.map((task) => task.text).join("; ") : "no queued tasks"}`);
      lines.push("");
    });

    lines.push("## Notes");
    lines.push("- Generated in local-first mode.");

    return lines.join("\n");
  };

  const generateReview = async () => {
    try {
      const result = await api.weeklyGenerate(weekStart);
      setMarkdown(result.review.markdown);
      setStats(result.review.stats);
      push("Markdown recap generated.", "success");
      return;
    } catch {
      const localMarkdown = generateMarkdownClient();
      setMarkdown(localMarkdown);
      setStats(computedStats);
      push("Generated with client-side fallback.", "warning");
    }
  };

  const closeWeek = async () => {
    try {
      const result = await api.weeklyClose(weekStart);
      await save(result.state);
      setMarkdown(result.review.markdown);
      setStats(result.review.stats);
      push("Week closed.", "success");
      return;
    } catch {
      const localMarkdown = markdown || generateMarkdownClient();
      const nowIso = new Date().toISOString();
      const next = { ...state };
      next.weeklyReviews.unshift({
        id: crypto.randomUUID(),
        weekStart,
        weekEnd,
        stats: stats ?? computedStats,
        perProject: perProject.map((item) => ({
          projectId: item.id,
          projectName: item.name,
          tasksDone: item.tasksDone,
          tasksCreated: item.tasksCreated,
          commitsCount: item.commits,
          focusMinutes: 0,
          journalCount: item.journal
        })),
        highlights,
        markdown: localMarkdown,
        createdAt: nowIso,
        closedAt: nowIso
      });
      next.weeklySnapshots.unshift({
        id: crypto.randomUUID(),
        weekStart,
        weekEnd,
        data: {
          stats: stats ?? computedStats,
          markdown: localMarkdown,
          perProject
        }
      });
      await save(next);
      setMarkdown(localMarkdown);
      setStats(stats ?? computedStats);
      push("Week closed with local snapshot.", "warning");
    }
  };

  const copyMarkdown = async () => {
    if (!markdown) {
      push("Generate a recap first.", "warning");
      return;
    }
    await navigator.clipboard.writeText(markdown);
    push("Markdown copied.", "success");
  };

  const summaryStats = stats ?? computedStats;

  return (
    <div className="space-y-6">
      <GlassPanel variant="hero">
        <SectionHeader
          eyebrow="Review"
          title="Weekly Review"
          subtitle={`${weekStart} to ${weekEnd}`}
          rightControls={<Pill tone="accent">Local-first recap</Pill>}
        />
        <div className="mt-4 grid gap-2 md:grid-cols-[180px_180px_auto_auto]">
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Week start</span>
            <input
              className="input"
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              aria-label="Select week start date"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Week end</span>
            <input className="input" type="date" value={weekEnd} readOnly aria-label="Computed week end" />
          </label>
          <button className="button-primary self-end" onClick={generateReview} aria-label="Generate markdown recap">
            Generate Markdown Recap
          </button>
          <button className="button-secondary self-end" onClick={closeWeek} aria-label="Close current week">
            Close Week
          </button>
        </div>
      </GlassPanel>

      <GlassPanel variant="standard">
        <SectionHeader eyebrow="Metrics" title="Week Stats" />
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div className="table-row">Goals completed: {summaryStats.goalsCompleted}</div>
          <div className="table-row">Points: {summaryStats.points}</div>
          <div className="table-row">Tasks done: {summaryStats.tasksDone}</div>
          <div className="table-row">Tasks created: {summaryStats.tasksCreated}</div>
          <div className="table-row">Roadmap moved: {summaryStats.roadmapMoved}</div>
          <div className="table-row">Commits count: {summaryStats.commitsCount}</div>
          <div className="table-row">Focus minutes: {summaryStats.focusMinutes}</div>
          <div className="table-row">Journal entries: {summaryStats.journalCount}</div>
          <div className="table-row">Streak delta: {summaryStats.streakDelta}</div>
        </div>
      </GlassPanel>

      <GlassPanel variant="standard">
        <SectionHeader eyebrow="Breakdown" title="Per-project Table" />
        <div className="mt-4 grid gap-2">
          <div className="table-row text-xs uppercase tracking-[0.2em] text-white/60">
            <span>Project</span>
            <span>Done</span>
            <span>Created</span>
            <span>Roadmap</span>
            <span>Commits</span>
            <span>Journal</span>
          </div>
          {perProject.map((row) => (
            <div key={row.id} className="table-row text-sm">
              <span>{row.name}</span>
              <span>{row.tasksDone}</span>
              <span>{row.tasksCreated}</span>
              <span>{row.roadmapMoved}</span>
              <span>{row.commits}</span>
              <span>{row.journal}</span>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel variant="standard">
        <SectionHeader
          eyebrow="Recap"
          title="Markdown"
          rightControls={
            <button className="button-secondary" onClick={copyMarkdown} aria-label="Copy markdown recap">
              Copy Markdown
            </button>
          }
        />
        <textarea
          className="input mt-4"
          rows={16}
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          placeholder="Generate a recap to populate markdown."
          aria-label="Weekly markdown recap"
        />
      </GlassPanel>
    </div>
  );
}
