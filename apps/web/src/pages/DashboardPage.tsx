import React, { useEffect, useState } from "react";
import { todayKey, computeGoalMetrics, type RoadmapLane } from "@linkra/shared";
import { useAppState } from "../lib/state";
import ProgressRing from "../components/ProgressRing";
import StackedBar from "../components/StackedBar";
import TabBar from "../components/TabBar";
import TaskRow from "../components/TaskRow";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatDate } from "../lib/date";

const tabs = ["Tasks", "Roadmap", "GitHub", "Settings"];

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

  if (!state) return null;

  const todayEntry = state.dailyGoalsByDate[todayKey()];
  const projects = state.projects;
  const selectedProject = projects.find((p) => p.id === (selectedId ?? projects[0]?.id));
  const repoByPath = new Map(state.localRepos.map((repo) => [repo.path, repo]));
  const linkedRemoteRepo = selectedProject?.remoteRepo ?? selectedProject?.githubRepo ?? null;
  const linkedLocalRepo = selectedProject?.localRepoPath
    ? repoByPath.get(selectedProject.localRepoPath)
    : null;
  const lastScanAt =
    state.localRepos
      .map((repo) => repo.scannedAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const scanErrorCount = state.localRepos.filter((repo) => repo.scanError).length;
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
    task.completedAt = new Date().toISOString();
    task.linkedCommit = linkedCommit;
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

  return (
    <div className="grid gap-6">
      <section className="panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Daily Goals</p>
            <h3 className="text-lg font-semibold">{dateLabel}</h3>
          </div>
          <div className="text-2xl font-semibold text-white/70">{todayEntry?.score ?? 0}%</div>
        </div>
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
          <button className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20" onClick={handleAddGoal}>
            + Add Goal
          </button>
          <button className="rounded-full bg-white/5 px-4 py-2 text-sm hover:bg-white/15" onClick={handleSaveTemplate}>
            Save as Template
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Local Git Status</p>
            <h3 className="text-lg font-semibold">{state.localRepos.length} repos</h3>
          </div>
          <div className="text-sm text-white/60">
            {lastScanAt ? `Last scan ${formatDate(lastScanAt)}` : "Scan not run yet"}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-white/60">
          <span>Active today: {state.localRepos.filter((repo) => repo.todayCommitCount > 0).length}</span>
          {scanErrorCount > 0 && <span className="text-amber-200">Errors: {scanErrorCount}</span>}
        </div>
      </section>

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
              className={`panel hover-lift text-left relative ${
                selectedProject?.id === project.id ? "ring-2 ring-white/30" : ""
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
                style={{ background: project.color, opacity: 0.4 }}
              />
            </button>
          );
        })}
        <div className="panel border-dashed border-white/20 flex items-center justify-center text-white/40">Add Project</div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="panel">
          {selectedProject && (
            <div className="grid gap-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{selectedProject.icon}</div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedProject.name}</h3>
                  <p className="text-sm text-white/50">{selectedProject.subtitle}</p>
                </div>
              </div>
              <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

              {activeTab === "Tasks" && (
                <div className="grid gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Tasks</p>
                <div className="grid gap-2">
                    {selectedProject.tasks.length === 0 && (
                      <p className="text-sm text-white/50">No tasks yet.</p>
                    )}
                    {selectedProject.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        text={task.text}
                        done={task.done}
                        dueLabel={task.dueDate ? deadlineLabel(task.dueDate) : undefined}
                        meta={
                          task.linkedCommit
                            ? `Verified by ${task.linkedCommit.shortSha} (${task.linkedCommit.score}%)`
                            : undefined
                        }
                        onToggle={(next) => toggleTask(task.id, next)}
                      />
                    ))}
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
                            {state.localRepos.map((repo) => (
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
        </div>

        <div className="panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Weekly Time Budget</p>
              <h3 className="text-lg font-semibold">{totalHours}h / week</h3>
            </div>
            <div className="text-sm text-white/50">{tasksProgress}%</div>
          </div>
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
        </div>
      </section>
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
