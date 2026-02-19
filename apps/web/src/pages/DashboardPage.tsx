import React, { useEffect, useState } from "react";
import {
  todayKey,
  computeGoalMetrics,
  type RoadmapLane,
  type Insight,
  type LocalRepo
} from "@linkra/shared";
import { useAppState } from "../lib/state";
import ProgressRing from "../components/ProgressRing";
import StackedBar from "../components/StackedBar";
import TabBar from "../components/TabBar";
import TaskRow from "../components/TaskRow";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { computeTodayPlan, isTaskBlocked } from "../lib/taskRules";
import { formatDate } from "../lib/date";

const tabs = ["Tasks", "Roadmap", "GitHub", "Journal", "Settings"];

type InsightGroup = {
  key: string;
  ruleId: string;
  projectId: string | null;
  repoId: string | null;
  title: string;
  reason: string;
  severity: "info" | "warn" | "crit";
  items: Insight[];
  relatedProjects: string[];
  relatedRepos: string[];
};

function severityRank(level: "info" | "warn" | "crit") {
  if (level === "crit") return 2;
  if (level === "warn") return 1;
  return 0;
}

function groupInsights(list: Insight[]): InsightGroup[] {
  const map = new Map<string, InsightGroup>();
  for (const insight of list) {
    const key = `${insight.ruleId}:${insight.projectId ?? "none"}:${insight.repoId ?? "none"}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        ruleId: insight.ruleId,
        projectId: insight.projectId ?? null,
        repoId: insight.repoId ?? null,
        title: insight.title,
        reason: insight.reason,
        severity: insight.severity,
        items: [insight],
        relatedProjects: insight.projectId ? [insight.projectId] : [],
        relatedRepos: insight.repoId ? [insight.repoId] : []
      });
    } else {
      existing.items.push(insight);
      if (severityRank(insight.severity) > severityRank(existing.severity)) {
        existing.severity = insight.severity;
      }
      if (!existing.repoId && insight.repoId) {
        existing.repoId = insight.repoId;
      }
      if (insight.projectId && !existing.relatedProjects.includes(insight.projectId)) {
        existing.relatedProjects.push(insight.projectId);
      }
      if (insight.repoId && !existing.relatedRepos.includes(insight.repoId)) {
        existing.relatedRepos.push(insight.repoId);
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  );
}

export default function DashboardPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Tasks");
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [localRepoInput, setLocalRepoInput] = useState("");
  const [commitFeed, setCommitFeed] = useState<any[]>([]);
  const [localCommitFeed, setLocalCommitFeed] = useState<any[]>([]);
  const [insightFilter, setInsightFilter] = useState<
    "priority" | "all" | "crit" | "warn" | "project"
  >("priority");
  const [todayPlanNotes, setTodayPlanNotes] = useState("");
  const [planSelection, setPlanSelection] = useState<string[]>([]);
  const [journalType, setJournalType] = useState<"note" | "decision" | "blocker" | "next" | "idea">("note");
  const [journalTitle, setJournalTitle] = useState("");
  const [journalBody, setJournalBody] = useState("");

  if (!state) return null;

  const todayEntry = state.dailyGoalsByDate[todayKey()];
  const projects = state.projects;
  const selectedProject = projects.find((p) => p.id === (selectedId ?? projects[0]?.id));
  const uniqueRepos = dedupeLocalRepos(state.localRepos);
  const repoByPath = new Map(uniqueRepos.map((repo) => [repo.path, repo]));
  const repoById = new Map(uniqueRepos.map((repo) => [repo.id, repo]));
  const linkedRemoteRepo = selectedProject?.remoteRepo ?? selectedProject?.githubRepo ?? null;
  const linkedLocalRepo = selectedProject?.localRepoPath
    ? repoByPath.get(selectedProject.localRepoPath)
    : null;
  const insights = state.insights ?? [];
  const projectInsights = insights.filter((insight) => insight.projectId === selectedProject?.id);
  const lastScanAt =
    uniqueRepos
      .map((repo) => repo.scannedAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const scanErrorCount = uniqueRepos.filter((repo) => repo.scanError).length;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date());

  useEffect(() => {
    setRepoInput(selectedProject?.remoteRepo ?? selectedProject?.githubRepo ?? "");
    setCommitFeed([]);
    setLocalRepoInput(selectedProject?.localRepoPath ?? "");
    setLocalCommitFeed([]);
  }, [selectedProject?.id]);

  useEffect(() => {
    setPlanSelection(state.todayPlanByDate?.[todayKey()]?.taskIds ?? []);
  }, [state.todayPlanByDate]);

  useEffect(() => {
    if (!selectedId && projects[0]) {
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);

  useEffect(() => {
    if (activeTab === "GitHub" && linkedRemoteRepo && state.github.loggedIn) {
      loadCommits();
    }
  }, [activeTab, linkedRemoteRepo, state.github.loggedIn]);

  useEffect(() => {
    if (activeTab === "GitHub" && selectedProject?.localRepoPath) {
      loadLocalCommits();
    }
  }, [activeTab, selectedProject?.localRepoPath]);

  const totalTasks = selectedProject?.tasks.length ?? 0;
  const completedTasks = selectedProject?.tasks.filter((t) => t.done).length ?? 0;

  const totalHours = projects.reduce((sum, p) => sum + p.weeklyHours, 0);

  const handleAddGoal = async () => {
    if (!todayEntry) return;
    const title = window.prompt("New goal");
    if (!title) return;
    const next = { ...state };
    next.dailyGoalsByDate[todayKey()].goals.unshift({
      id: crypto.randomUUID(),
      title,
      category: "Focus",
      points: 1,
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    });
    const metrics = computeGoalMetrics(next.dailyGoalsByDate[todayKey()].goals);
    next.dailyGoalsByDate[todayKey()].score = metrics.score;
    next.dailyGoalsByDate[todayKey()].completedPoints = metrics.completedPoints;
    await save(next);
  };

  const handleSaveTemplate = async () => {
    if (!todayEntry) return;
    const next = { ...state };
    next.userSettings.goalTemplate = todayEntry.goals.map((goal) => ({ ...goal }));
    await save(next);
  };

  const addTask = async () => {
    if (!selectedProject || !taskText.trim()) return;
    const next = { ...state };
    const project = next.projects.find((p) => p.id === selectedProject.id);
    if (!project) return;
    project.tasks.unshift({
      id: crypto.randomUUID(),
      text: taskText.trim(),
      done: false,
      status: "todo",
      dependsOnIds: [],
      priority: "med",
      dueDate: taskDue || null,
      milestone: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      linkedCommit: null
    });
    setTaskText("");
    setTaskDue("");
    await save(next);
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((p) => p.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;

    if (!done) {
      task.done = false;
      task.status = "todo";
      task.completedAt = null;
      task.linkedCommit = null;
      await save(next);
      return;
    }

    let linkedCommit = null;
    if (linkedRemoteRepo && state.github.loggedIn) {
      try {
        const result = await api.githubCommitMatch(linkedRemoteRepo, task.text);
        linkedCommit = result.match ?? null;
        if (linkedCommit) {
          push(`Matched commit ${linkedCommit.shortSha}`);
        } else {
          push("No matching GitHub commit found.");
        }
      } catch (err) {
        push(err instanceof Error ? err.message : "GitHub match failed");
      }
    } else {
      push("GitHub repo not linked or not logged in.");
    }

    task.done = true;
    task.status = "done";
    task.completedAt = new Date().toISOString();
    task.linkedCommit = linkedCommit;
    await save(next);
  };

  const updateTaskStatus = async (taskId: string, status: "todo" | "doing" | "done") => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((p) => p.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (status === "doing" && isTaskBlocked(task, project.tasks)) {
      const confirm = window.confirm("This task is blocked by dependencies. Mark as doing anyway?");
      if (!confirm) return;
    }
    task.status = status;
    task.done = status === "done";
    task.completedAt = status === "done" ? new Date().toISOString() : null;
    await save(next);
  };

  const updateTaskDependencies = async (taskId: string, deps: string[]) => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((p) => p.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.dependsOnIds = deps;
    await save(next);
  };

  const updateTaskPriority = async (taskId: string, priority: "low" | "med" | "high") => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((p) => p.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.priority = priority;
    await save(next);
  };

  const adjustHours = async (projectId: string, delta: number) => {
    const next = { ...state };
    const project = next.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.weeklyHours = Math.max(0, project.weeklyHours + delta);
    await save(next);
  };

  const setProjectRepo = async () => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((p) => p.id === selectedProject.id);
    if (!project) return;
    project.githubRepo = repoInput.trim() || null;
    project.remoteRepo = project.githubRepo;
    setRepoInput("");
    await save(next);
  };

  const loadCommits = async () => {
    const repo = selectedProject?.remoteRepo ?? selectedProject?.githubRepo;
    if (!repo) return;
    const response = await api.githubCommits(repo, "main", 8);
    setCommitFeed(response.commits ?? []);
  };

  const linkLocalRepo = async () => {
    if (!selectedProject || !localRepoInput) return;
    await api.gitLink(selectedProject.id, localRepoInput);
    await refresh();
  };

  const unlinkLocalRepo = async () => {
    if (!selectedProject) return;
    await api.gitUnlink(selectedProject.id);
    await refresh();
    setLocalCommitFeed([]);
  };

  const loadLocalCommits = async () => {
    if (!selectedProject?.localRepoPath) return;
    const response = await api.gitLocalCommits(selectedProject.localRepoPath, 8);
    setLocalCommitFeed(response.commits ?? []);
  };

  const addJournalEntry = async () => {
    if (!journalBody.trim()) return;
    const next = { ...state };
    next.journalEntries.unshift({
      id: crypto.randomUUID(),
      projectId: selectedProject?.id ?? null,
      ts: new Date().toISOString(),
      type: journalType,
      title: journalTitle.trim() || null,
      body: journalBody.trim(),
      links: {
        taskIds: [],
        roadmapCardIds: [],
        repoIds: linkedLocalRepo ? [linkedLocalRepo.id] : [],
        commitShas: []
      },
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setJournalTitle("");
    setJournalBody("");
    await save(next);
  };

  const filteredRoadmap = state.roadmapCards.filter(
    (card) => card.project === selectedProject?.name
  );

  const lanes: { key: RoadmapLane; label: string }[] = [
    { key: "now", label: "Now" },
    { key: "next", label: "Next" },
    { key: "later", label: "Later" },
    { key: "shipped", label: "Shipped" }
  ];

  const onDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData("text/plain", id);
  };

  const onDrop = async (event: React.DragEvent, lane: RoadmapLane) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const next = { ...state };
    next.roadmapCards = next.roadmapCards.map((card) =>
      card.id === id ? { ...card, lane, updatedAt: new Date().toISOString() } : card
    );
    await save(next);
  };

  const tasksProgress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const todayPlan = state.todayPlanByDate?.[todayKey()] ?? null;

  const filteredInsights = insights.filter((insight) => {
    if (insightFilter === "priority") return insight.severity !== "info";
    if (insightFilter === "crit") return insight.severity === "crit";
    if (insightFilter === "warn") return insight.severity === "warn";
    if (insightFilter === "project") return insight.projectId === selectedProject?.id;
    return true;
  });

  const groupedInsights = groupInsights(filteredInsights);

  const generateTodayPlan = () => {
    const items = state.projects.flatMap((project) =>
      project.tasks.map((task) => ({ task, projectName: project.name }))
    );
    const boostProjectNames = new Set<string>();
    state.roadmapCards
      .filter((card) => card.lane === "now" && card.project)
      .forEach((card) => boostProjectNames.add(card.project as string));
    insights
      .filter((insight) => insight.projectId)
      .forEach((insight) => {
        const project = state.projects.find((p) => p.id === insight.projectId);
        if (project) boostProjectNames.add(project.name);
      });
    return computeTodayPlan(items, { boostProjectNames: Array.from(boostProjectNames) });
  };

  const applyTodayPlan = async (source: "auto" | "manual") => {
    const next = { ...state };
    const taskIds = source === "auto" ? generateTodayPlan() : planSelection;
    next.todayPlanByDate[todayKey()] = {
      taskIds,
      generatedAt: new Date().toISOString(),
      source,
      notes: todayPlanNotes || null
    };
    await save(next);
  };

  const runInsightAction = async (insight: Insight, action: any) => {
    const payload = { ...action.payload, insightId: insight.id };
    const result = await api.insightAction({ ...action, payload });
    await refresh();
    if (action.type === "COPY_REPO_PATH" && payload.repoPath) {
      navigator.clipboard.writeText(payload.repoPath).catch(() => null);
    }
    if (action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W") {
      push("Insight snoozed.");
    }
    if (result.state) {
      push("Action applied.");
    }
  };

  const runGroupedAction = async (group: InsightGroup, action: any) => {
    if (action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W") {
      for (const item of group.items) {
        await api.insightAction({
          ...action,
          payload: { ...action.payload, insightId: item.id }
        });
      }
      await refresh();
      push("Insight snoozed.");
      return;
    }

    const first = group.items[0];
    if (first) {
      await runInsightAction(first, action);
    }
  };

  return (
    <div className="grid gap-6">
      <GlassPanel variant="hero">
        <SectionHeader
          title="Daily Goals"
          subtitle={dateLabel}
          rightControls={<div className="text-2xl font-semibold text-white/70">{todayEntry?.score ?? 0}%</div>}
        />
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center gap-4">
            <input type="checkbox" checked={todayEntry?.goals[0]?.done ?? false} readOnly />
            <div>
              <p className="text-sm">{todayEntry?.goals[0]?.title ?? "Add your first goal"}</p>
              <span className="pill bg-emerald-500/20 text-emerald-300">Auto-synced</span>
            </div>
          </div>
          <div className="text-sm text-white/60">
            {todayEntry?.completedPoints ?? 0}/{todayEntry?.goals.length ?? 0}
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button className="button-secondary" onClick={handleAddGoal}>
            + Add Goal
          </button>
          <button className="button-secondary" onClick={handleSaveTemplate}>
            Save as Template
          </button>
        </div>
      </GlassPanel>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {projects.map((project) => {
          const tasksDone = project.tasks.filter((t) => t.done).length;
          const tasksTotal = project.tasks.length;
          const progress = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : project.progress;
          const repo = project.localRepoPath ? repoByPath.get(project.localRepoPath) : null;
          const activity = repo?.todayCommitCount ?? 0;
          const dirty = repo?.dirty ?? false;
          return (
            <button
              key={project.id}
              className={`card hover-lift text-left relative ${
                selectedProject?.id === project.id ? "accent-glow" : ""
              }`}
              onClick={() => setSelectedId(project.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl">{project.icon}</div>
                  <h4 className="mt-2 text-base font-semibold">{project.name}</h4>
                  <p className="text-xs text-white/50">{project.subtitle}</p>
                </div>
                <ProgressRing value={progress} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
                  {project.status}
                </span>
                <span className="text-xs text-white/50">{project.weeklyHours}h/week</span>
              </div>
              <div className="mt-2 text-xs text-white/60">
                Tasks: {tasksDone}/{tasksTotal}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${activity > 0 ? "bg-emerald-400" : "bg-white/30"}`}
                  />
                  <span>{activity} today</span>
                  {dirty && <span className="chip text-amber-200">Dirty</span>}
                </div>
                {project.healthScore !== null && (
                  <span className="chip">Health {project.healthScore}%</span>
                )}
              </div>
              <div
                className="absolute inset-x-0 bottom-0 h-1 rounded-b-xl"
                style={{ background: project.color, opacity: selectedProject?.id === project.id ? 0.65 : 0.2 }}
              />
            </button>
          );
        })}
        <div className="card border-dashed border-white/20 flex items-center justify-center text-white/40">
          Add Project
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <GlassPanel variant="standard" className="accent-glow">
          {selectedProject && (
            <div className="grid gap-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{selectedProject.icon}</div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedProject.name}</h3>
                  <p className="text-sm text-white/50">{selectedProject.subtitle}</p>
                </div>
              </div>
              {projectInsights.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/50">Project Insights</div>
                  <div className="mt-2 grid gap-2">
                    {projectInsights.slice(0, 3).map((insight) => (
                      <div key={insight.id} className="flex items-center justify-between text-xs">
                        <span>{insight.title}</span>
                        <span className="chip">{insight.severity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

              {activeTab === "Tasks" && (
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Tasks</p>
                <div className="grid gap-2">
                    {selectedProject.tasks.length === 0 && (
                      <p className="text-sm text-white/50">No tasks yet.</p>
                    )}
                    {selectedProject.tasks.map((task) => {
                      const blocked = isTaskBlocked(task, selectedProject.tasks);
                      return (
                      <div key={task.id} className="grid gap-2">
                        <TaskRow
                          text={task.text}
                          done={task.done}
                          dueLabel={task.dueDate ? deadlineLabel(task.dueDate) : undefined}
                          meta={
                            task.linkedCommit
                              ? `Verified by ${task.linkedCommit.shortSha} (${task.linkedCommit.score}%)`
                              : blocked
                              ? "Blocked by dependencies"
                              : task.status === "doing"
                              ? "In progress"
                              : undefined
                          }
                          onToggle={(next) => toggleTask(task.id, next)}
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                          <label className="flex items-center gap-2">
                            Status
                            <select
                              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs"
                              value={task.status}
                              onChange={(event) => updateTaskStatus(task.id, event.target.value as any)}
                            >
                              <option value="todo">Todo</option>
                              <option value="doing">Doing</option>
                              <option value="done">Done</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2">
                            Priority
                            <select
                              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs"
                              value={task.priority}
                              onChange={(event) => updateTaskPriority(task.id, event.target.value as any)}
                            >
                              <option value="low">Low</option>
                              <option value="med">Med</option>
                              <option value="high">High</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2">
                            Depends on
                            <select
                              multiple
                              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs"
                              value={task.dependsOnIds}
                              onChange={(event) =>
                                updateTaskDependencies(
                                  task.id,
                                  Array.from(event.target.selectedOptions).map((opt) => opt.value)
                                )
                              }
                            >
                              {selectedProject.tasks
                                .filter((candidate) => candidate.id !== task.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.text}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_140px_140px_44px] gap-2">
                    <input
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                      placeholder="Add a task..."
                      value={taskText}
                      onChange={(event) => setTaskText(event.target.value)}
                    />
                    <select className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm">
                      <option>No milestone</option>
                    </select>
                    <input
                      type="date"
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                      value={taskDue}
                      onChange={(event) => setTaskDue(event.target.value)}
                    />
                    <button className="rounded-lg bg-purple-500/80 hover:bg-purple-500" onClick={addTask}>
                      +
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "Roadmap" && (
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Roadmap</p>
                  <div className="grid grid-cols-4 gap-3">
                    {lanes.map((lane) => (
                      <div
                        key={lane.key}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 min-h-[160px]"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => onDrop(event, lane.key)}
                      >
                        <h4 className="text-sm font-semibold mb-2">{lane.label}</h4>
                        <div className="grid gap-2">
                          {filteredRoadmap
                            .filter((card) => card.lane === lane.key)
                            .map((card) => (
                              <div
                                key={card.id}
                                draggable
                                onDragStart={(event) => onDragStart(event, card.id)}
                                className="rounded-lg border border-white/10 bg-white/10 px-2 py-2 text-xs"
                              >
                                <div className="font-medium">{card.title}</div>
                                <div className="text-white/50">{card.tags.join(", ")}</div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "GitHub" && (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/50">Local Repo</p>
                    {linkedLocalRepo ? (
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">{linkedLocalRepo.name}</div>
                            <div className="text-xs text-white/50">{linkedLocalRepo.path}</div>
                          </div>
                          <button className="rounded-lg bg-white/10 px-3 py-1 text-xs" onClick={unlinkLocalRepo}>
                            Unlink
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                          <div>Branch: {linkedLocalRepo.defaultBranch ?? "—"}</div>
                          <div>Dirty: {linkedLocalRepo.dirty ? "Yes" : "No"}</div>
                          <div>Ahead/Behind: {linkedLocalRepo.ahead}/{linkedLocalRepo.behind}</div>
                          <div>Today: {linkedLocalRepo.todayCommitCount} commits</div>
                        </div>
                        <div className="flex gap-2">
                          <button className="rounded-lg bg-white/10 px-3 py-1 text-xs" onClick={loadLocalCommits}>
                            Load Local Commits
                          </button>
                        </div>
                        <div className="grid gap-2">
                          {localCommitFeed.map((commit) => (
                            <div key={commit.sha} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                              <div className="text-sm font-medium">{commit.message}</div>
                              <div className="text-xs text-white/50">{commit.author} · {commit.shortSha}</div>
                            </div>
                          ))}
                          {localCommitFeed.length === 0 && (
                            <p className="text-sm text-white/50">No local commits loaded.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <div className="flex gap-2">
                          <select
                            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                            value={localRepoInput}
                            onChange={(event) => setLocalRepoInput(event.target.value)}
                          >
                            <option value="">Select local repo</option>
                            {uniqueRepos.map((repo) => (
                              <option key={repo.id} value={repo.path}>
                                {repo.name} — {repo.path}
                              </option>
                            ))}
                          </select>
                          <button className="rounded-lg bg-white/10 px-3" onClick={linkLocalRepo}>
                            Link
                          </button>
                        </div>
                        <p className="text-xs text-white/50">Scan repos in Settings to populate this list.</p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/50">GitHub</p>
                    {!state.github.loggedIn && (
                      <a className="rounded-full bg-white/10 px-4 py-2 text-sm w-fit" href="/auth/github/start">
                        Connect GitHub
                      </a>
                    )}
                    {state.github.loggedIn && (
                      <div className="grid gap-2">
                        <div className="flex gap-2">
                          <input
                            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                            placeholder="owner/repo"
                            value={repoInput}
                            onChange={(event) => setRepoInput(event.target.value)}
                          />
                          <button className="rounded-lg bg-white/10 px-3" onClick={setProjectRepo}>
                            Save
                          </button>
                          <button className="rounded-lg bg-white/10 px-3" onClick={loadCommits}>
                            Load
                          </button>
                        </div>
                        <div className="grid gap-2">
                          {commitFeed.map((commit) => (
                            <div key={commit.sha} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                              <div className="text-sm font-medium">{commit.message}</div>
                              <div className="text-xs text-white/50">{commit.author} · {commit.shortSha}</div>
                            </div>
                          ))}
                          {commitFeed.length === 0 && <p className="text-sm text-white/50">No commits loaded.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "Journal" && (
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Journal</p>
                  <div className="grid gap-2">
                    {state.journalEntries
                      .filter((entry) => entry.projectId === selectedProject?.id)
                      .slice(0, 6)
                      .map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <div className="text-xs text-white/50">{entry.type.toUpperCase()}</div>
                          <div className="text-sm font-medium">{entry.title ?? "Untitled"}</div>
                          <div className="text-xs text-white/60">{entry.body}</div>
                        </div>
                      ))}
                  </div>
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <select
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                        value={journalType}
                        onChange={(event) => setJournalType(event.target.value as any)}
                      >
                        <option value="note">Note</option>
                        <option value="decision">Decision</option>
                        <option value="blocker">Blocker</option>
                        <option value="next">Next</option>
                        <option value="idea">Idea</option>
                      </select>
                      <input
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                        placeholder="Title (optional)"
                        value={journalTitle}
                        onChange={(event) => setJournalTitle(event.target.value)}
                      />
                    </div>
                    <textarea
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                      placeholder="Journal entry..."
                      rows={3}
                      value={journalBody}
                      onChange={(event) => setJournalBody(event.target.value)}
                    />
                    <button className="rounded-lg bg-white/10 px-4 py-2 text-sm w-fit" onClick={addJournalEntry}>
                      Add Entry
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "Settings" && (
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Project Settings</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/50">Status</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                        value={selectedProject.status}
                        onChange={async (event) => {
                          const next = { ...state };
                          const project = next.projects.find((p) => p.id === selectedProject.id);
                          if (!project) return;
                          project.status = event.target.value as any;
                          await save(next);
                        }}
                      >
                        <option>Not Started</option>
                        <option>In Progress</option>
                        <option>Review</option>
                        <option>On Hold</option>
                        <option>Done</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-white/50">Weekly Hours</label>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
                        value={selectedProject.weeklyHours}
                        onChange={async (event) => {
                          const next = { ...state };
                          const project = next.projects.find((p) => p.id === selectedProject.id);
                          if (!project) return;
                          project.weeklyHours = Number(event.target.value) || 0;
                          await save(next);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassPanel>

        <GlassPanel variant="standard">
          <SectionHeader
            title="Weekly Time Budget"
            subtitle={`${totalHours}h / week`}
            rightControls={<div className="text-sm text-white/50">{tasksProgress}%</div>}
          />
          <div className="mt-4">
            <StackedBar
              segments={projects.map((p) => ({ color: p.color, value: p.weeklyHours }))}
            />
          </div>
          <div className="mt-4 grid gap-3">
            {projects.map((project) => (
              <div key={project.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
                  <span>{project.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="h-6 w-6 rounded-md border border-white/10 bg-white/10"
                    onClick={() => adjustHours(project.id, -1)}
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-white/60">{project.weeklyHours}h</span>
                  <button
                    className="h-6 w-6 rounded-md border border-white/10 bg-white/10"
                    onClick={() => adjustHours(project.id, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </section>

      <GlassPanel variant="standard">
        <SectionHeader
          title="Insights"
          subtitle="Signals → Actions"
          rightControls={
            <>
              <button
                className={insightFilter === "priority" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("priority")}
              >
                Critical+Warnings
              </button>
              <button
                className={insightFilter === "all" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("all")}
              >
                All
              </button>
              <button
                className={insightFilter === "crit" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("crit")}
              >
                Critical
              </button>
              <button
                className={insightFilter === "warn" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("warn")}
              >
                Warnings
              </button>
              <button
                className={insightFilter === "project" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("project")}
              >
                By Project
              </button>
            </>
          }
        />
        <div className="mt-4 grid gap-3">
          {groupedInsights.length === 0 && (
            <p className="text-sm text-white/60">No insights right now.</p>
          )}
          {groupedInsights.map((group) => {
            const projectNames = group.relatedProjects
              .map((id) => state.projects.find((p) => p.id === id)?.name)
              .filter((name): name is string => Boolean(name));
            const repoNames = group.relatedRepos
              .map((id) => repoById.get(id)?.name)
              .filter((name): name is string => Boolean(name));
            const repoPath = group.repoId ? repoById.get(group.repoId)?.path ?? null : null;
            return (
              <GlassPanel key={group.key} variant="standard" className="p-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                    <div>
                      <div className="text-sm font-semibold">
                        {group.title}
                        {group.items.length > 1 ? ` x${group.items.length}` : ""}
                      </div>
                      <div className="text-xs text-white/60">{group.reason}</div>
                    </div>
                    <span className="chip">{group.severity}</span>
                  </summary>
                  <div className="border-t border-white/10 px-4 pb-4">
                    <div className="mt-3 grid gap-1 text-xs text-white/60">
                      {projectNames.length > 0 && (
                        <div>Projects: {projectNames.join(", ")}</div>
                      )}
                      {repoNames.length > 0 && (
                        <div>Repos: {repoNames.join(", ")}</div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="button-secondary"
                        onClick={() =>
                          runGroupedAction(group, {
                            id: "create-task",
                            type: "CREATE_TASK",
                            label: "Create task",
                            payload: {
                              projectId: group.projectId,
                              title: `Follow up: ${group.title}`
                            }
                          })
                        }
                      >
                        Create task
                      </button>
                      <button
                        className="button-secondary"
                        onClick={() =>
                          runGroupedAction(group, {
                            id: "schedule-focus",
                            type: "SCHEDULE_FOCUS",
                            label: "Schedule focus",
                            payload: {
                              projectId: group.projectId,
                              minutes: 45,
                              reason: group.title
                            }
                          })
                        }
                      >
                        Schedule focus
                      </button>
                      {repoPath && (
                        <button
                          className="button-secondary"
                          onClick={() =>
                            runGroupedAction(group, {
                              id: "open-repo",
                              type: "OPEN_REPO",
                              label: "Open repo",
                              payload: { repoPath }
                            })
                          }
                        >
                          Open repo
                        </button>
                      )}
                      <button
                        className="button-secondary"
                        onClick={() =>
                          runGroupedAction(group, {
                            id: "snooze-1d",
                            type: "SNOOZE_1D",
                            label: "Snooze 1d",
                            payload: {}
                          })
                        }
                      >
                        Snooze 1d
                      </button>
                      <button
                        className="button-secondary"
                        onClick={() =>
                          runGroupedAction(group, {
                            id: "snooze-1w",
                            type: "SNOOZE_1W",
                            label: "Snooze 1w",
                            payload: {}
                          })
                        }
                      >
                        Snooze 1w
                      </button>
                    </div>
                  </div>
                </details>
              </GlassPanel>
            );
          })}
        </div>
      </GlassPanel>

      <GlassPanel variant="quiet">
        <SectionHeader
          title="Local Git Status"
          subtitle={`${uniqueRepos.length} repos`}
          rightControls={
            <div className="text-sm text-white/60">
              {lastScanAt ? `Last scan ${formatDate(lastScanAt)}` : "Scan not run yet"}
            </div>
          }
        />
        <div className="mt-3 flex items-center gap-3 text-sm text-white/60">
          <span>Active today: {uniqueRepos.filter((repo) => repo.todayCommitCount > 0).length}</span>
          {scanErrorCount > 0 && <span className="text-amber-200">Errors: {scanErrorCount}</span>}
        </div>
      </GlassPanel>

      <GlassPanel variant="standard">
        <SectionHeader
          title="Today Plan"
          subtitle="Focus lineup"
          rightControls={
            <button className="button-secondary" onClick={() => applyTodayPlan("auto")}>
              Auto-generate
            </button>
          }
        />
        <div className="mt-3 grid gap-2">
          {(todayPlan?.taskIds ?? []).length === 0 && (
            <p className="text-sm text-white/60">No tasks selected yet.</p>
          )}
          {(todayPlan?.taskIds ?? []).map((taskId) => {
            const task = state.projects.flatMap((p) => p.tasks).find((t) => t.id === taskId);
            return task ? (
              <div key={taskId} className="table-row">
                <span>{task.text}</span>
                <span className="chip">{task.priority}</span>
              </div>
            ) : null;
          })}
        </div>
        <div className="mt-3 grid gap-2">
          <label className="text-xs text-white/60">Edit plan</label>
          <select
            multiple
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
            value={planSelection}
            onChange={(event) =>
              setPlanSelection(Array.from(event.target.selectedOptions).map((opt) => opt.value))
            }
          >
            {state.projects.flatMap((project) =>
              project.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {project.name}: {task.text}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            placeholder="Notes for today..."
            value={todayPlanNotes}
            onChange={(event) => setTodayPlanNotes(event.target.value)}
          />
          <button className="button-primary" onClick={() => applyTodayPlan("manual")}>
            Save Plan
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}

function deadlineLabel(dateStr: string) {
  const today = new Date();
  const due = new Date(dateStr);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, tone: "overdue" as const };
  if (diffDays === 0) return { text: "Due today", tone: "normal" as const };
  return { text: `${diffDays}d left`, tone: "normal" as const };
}

function dedupeLocalRepos(repos: LocalRepo[]) {
  const map = new Map<string, LocalRepo>();
  for (const repo of repos) {
    const key = repo.path;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, repo);
      continue;
    }
    const existingTime = existing.scannedAt ? new Date(existing.scannedAt).getTime() : 0;
    const nextTime = repo.scannedAt ? new Date(repo.scannedAt).getTime() : 0;
    if (nextTime >= existingTime) {
      map.set(key, repo);
    }
  }
  return Array.from(map.values());
}
