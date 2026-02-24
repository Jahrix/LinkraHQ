import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  computeGoalMetrics,
  todayKey,
  type Insight,
  type LocalRepo,
  type Project,
  type ProjectTask,
  type RoadmapCard,
  type RoadmapLane
} from "@linkra/shared";
import { useAppState } from "../lib/state";
import ProgressRing from "../components/ProgressRing";
import StackedBar from "../components/StackedBar";
import TabBar from "../components/TabBar";
import TaskRow from "../components/TaskRow";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";
import Pill from "../components/Pill";
import Modal from "../components/Modal";
import EmojiPicker, { rememberRecentEmoji } from "../components/EmojiPicker";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { computeTodayPlan, isTaskBlocked } from "../lib/taskRules";
import { formatDate } from "../lib/date";

const tabs = ["Tasks", "Roadmap", "GitHub", "Journal", "Settings"];
const uiStatuses = ["Not Started", "In Progress", "Done", "Archived"] as const;
type UiProjectStatus = (typeof uiStatuses)[number];

type InsightGroup = {
  key: string;
  ruleId: string;
  projectId: string | null;
  repoId: string | null;
  title: string;
  reason: string;
  severity: "info" | "warn" | "crit";
  items: Insight[];
};

type ProjectDraft = {
  emoji: string;
  name: string;
  subtitle: string;
  status: UiProjectStatus;
  weeklyHours: number;
  localRepoPath: string;
  githubRepo: string;
};

type JournalDraft = {
  type: "note" | "decision" | "blocker" | "next" | "idea";
  title: string;
  body: string;
  tags: string;
  taskIds: string[];
  roadmapCardIds: string[];
  commitShas: string;
};

const emptyJournalDraft: JournalDraft = {
  type: "note",
  title: "",
  body: "",
  tags: "",
  taskIds: [],
  roadmapCardIds: [],
  commitShas: ""
};

const projectColors = ["#5DD8FF", "#78E3A4", "#F9A8D4", "#F59E0B", "#60A5FA", "#A78BFA", "#22D3EE"];

export default function DashboardPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Tasks");
  const [showArchived, setShowArchived] = useState(false);
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"create" | "edit">("create");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>({
    emoji: "🚀",
    name: "",
    subtitle: "",
    status: "Not Started",
    weeklyHours: 6,
    localRepoPath: "",
    githubRepo: ""
  });

  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "med" | "high">("med");

  const [remoteRepoInput, setRemoteRepoInput] = useState("");
  const [localRepoInput, setLocalRepoInput] = useState("");
  const [commitFeed, setCommitFeed] = useState<any[]>([]);
  const [localCommitFeed, setLocalCommitFeed] = useState<any[]>([]);

  const [insightFilter, setInsightFilter] = useState<"priority" | "all" | "crit" | "warn">("priority");

  const [todayPlanDraft, setTodayPlanDraft] = useState<string[]>([]);
  const [todayPlanNotes, setTodayPlanNotes] = useState("");
  const [todayTaskQuery, setTodayTaskQuery] = useState("");

  const [journalQuery, setJournalQuery] = useState("");
  const [journalModalOpen, setJournalModalOpen] = useState(false);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [journalDraft, setJournalDraft] = useState<JournalDraft>(emptyJournalDraft);

  const duplicateWarnings = useRef(new Set<string>());

  if (!state) return null;

  const dedupedProjects = dedupeById(state.projects);
  const projects = dedupedProjects.items;
  const dedupedLocalRepos = dedupeLocalRepos(state.localRepos ?? []);
  const uniqueRepos = dedupedLocalRepos.items;
  const repoByPath = new Map(uniqueRepos.map((repo) => [repo.path, repo]));
  const repoById = new Map(uniqueRepos.map((repo) => [repo.id, repo]));

  const now = Date.now();
  const activeInsights = dedupeById(state.insights ?? []).items.filter((item) => {
    if (item.dismissedUntil && new Date(item.dismissedUntil).getTime() > now) return false;
    if (!showArchived && item.projectId) {
      const project = projects.find((candidate) => candidate.id === item.projectId);
      if (project && isArchivedProject(project)) return false;
    }
    return true;
  });

  const visibleProjects = showArchived ? projects : projects.filter((project) => !isArchivedProject(project));
  const selectedProject =
    projects.find((project) => project.id === selectedId) ??
    (visibleProjects.length ? visibleProjects[0] : projects[0] ?? null);

  const selectedTasks = selectedProject ? dedupeById(selectedProject.tasks).items : [];
  const selectedProjectInsights = activeInsights.filter((insight) => insight.projectId === selectedProject?.id);
  const todayEntry = state.dailyGoalsByDate[todayKey()];
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

  const githubRepoOptions = Array.from(
    new Set(projects.map((project) => project.githubRepo).filter((repo): repo is string => Boolean(repo)))
  );

  const filteredInsights = activeInsights.filter((insight) => {
    if (insightFilter === "priority") return insight.severity !== "info";
    if (insightFilter === "crit") return insight.severity === "crit";
    if (insightFilter === "warn") return insight.severity === "warn";
    return true;
  });

  const groupedInsights = groupInsights(filteredInsights);

  const filteredRoadmap = state.roadmapCards.filter((card) =>
    isRoadmapCardForProject(card, selectedProject, projects)
  );

  const lanes: { key: RoadmapLane; label: string }[] = [
    { key: "now", label: "Now" },
    { key: "next", label: "Next" },
    { key: "later", label: "Later" },
    { key: "shipped", label: "Shipped" }
  ];

  const totalHours = visibleProjects.reduce((sum, project) => sum + project.weeklyHours, 0);
  const totalTasks = visibleProjects.reduce((sum, project) => sum + project.tasks.length, 0);
  const completedTasks = visibleProjects.reduce(
    (sum, project) => sum + project.tasks.filter((task) => task.done).length,
    0
  );
  const tasksProgress = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const todayPlan = state.todayPlanByDate?.[todayKey()] ?? null;

  const availableTodayTasks = visibleProjects.flatMap((project) =>
    dedupeById(project.tasks)
      .items.filter((task) => !task.done)
      .map((task) => ({
        id: task.id,
        text: task.text,
        projectName: project.name,
        priority: task.priority,
        dueDate: task.dueDate
      }))
  );

  const todayTaskOptions = availableTodayTasks.filter(
    (task) =>
      !todayPlanDraft.includes(task.id) &&
      `${task.projectName} ${task.text}`.toLowerCase().includes(todayTaskQuery.toLowerCase())
  );

  const projectJournalEntries = dedupeById(state.journalEntries)
    .items.filter((entry) => entry.projectId === selectedProject?.id)
    .filter((entry) => {
      const query = journalQuery.trim().toLowerCase();
      if (!query) return true;
      const text = `${entry.type} ${entry.title ?? ""} ${entry.body} ${(entry.tags ?? []).join(" ")}`.toLowerCase();
      return text.includes(query);
    })
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));

  useEffect(() => {
    if (!selectedId && visibleProjects[0]) {
      setSelectedId(visibleProjects[0].id);
      return;
    }
    if (selectedId && !showArchived) {
      const selected = projects.find((project) => project.id === selectedId);
      if (selected && isArchivedProject(selected) && visibleProjects[0]) {
        setSelectedId(visibleProjects[0].id);
      }
    }
  }, [selectedId, visibleProjects, projects, showArchived]);

  useEffect(() => {
    setRemoteRepoInput(selectedProject?.remoteRepo ?? selectedProject?.githubRepo ?? "");
    setLocalRepoInput(selectedProject?.localRepoPath ?? "");
    setCommitFeed([]);
    setLocalCommitFeed([]);
    setActiveTab("Tasks");
  }, [selectedProject?.id]);

  useEffect(() => {
    setTodayPlanDraft(state.todayPlanByDate?.[todayKey()]?.taskIds ?? []);
    setTodayPlanNotes(state.todayPlanByDate?.[todayKey()]?.notes ?? "");
  }, [state.todayPlanByDate]);

  useEffect(() => {
    const duplicateProjectSignature = dedupedProjects.duplicates.join(",");
    if (duplicateProjectSignature && !duplicateWarnings.current.has(`project:${duplicateProjectSignature}`)) {
      duplicateWarnings.current.add(`project:${duplicateProjectSignature}`);
      push(`Duplicate project IDs detected in import. UI deduped ${dedupedProjects.duplicates.length} entries.`, "warning");
    }
    const duplicateRepoSignature = dedupedLocalRepos.duplicates.join(",");
    if (duplicateRepoSignature && !duplicateWarnings.current.has(`repo:${duplicateRepoSignature}`)) {
      duplicateWarnings.current.add(`repo:${duplicateRepoSignature}`);
      push(`Duplicate repositories detected in import. UI deduped ${dedupedLocalRepos.duplicates.length} entries.`, "warning");
    }
  }, [dedupedProjects.duplicates, dedupedLocalRepos.duplicates, push]);

  const openCreateProjectModal = () => {
    setProjectModalMode("create");
    setEditingProjectId(null);
    setProjectDraft({
      emoji: "🚀",
      name: "",
      subtitle: "",
      status: "Not Started",
      weeklyHours: 6,
      localRepoPath: "",
      githubRepo: ""
    });
    setProjectModalOpen(true);
  };

  const openEditProjectModal = (project: Project) => {
    setProjectModalMode("edit");
    setEditingProjectId(project.id);
    setProjectDraft({
      emoji: project.icon,
      name: project.name,
      subtitle: project.subtitle,
      status: toUiStatus(project.status),
      weeklyHours: project.weeklyHours,
      localRepoPath: project.localRepoPath ?? "",
      githubRepo: project.githubRepo ?? project.remoteRepo ?? ""
    });
    setProjectModalOpen(true);
    setOpenProjectMenu(null);
  };

  const saveProjectDraft = async () => {
    if (!projectDraft.name.trim()) {
      push("Project name is required.", "error");
      return;
    }

    rememberRecentEmoji(projectDraft.emoji);
    const next = { ...state };
    const nowIso = new Date().toISOString();

    if (projectModalMode === "create") {
      const id = crypto.randomUUID();
      next.projects.unshift({
        id,
        name: projectDraft.name.trim(),
        subtitle: projectDraft.subtitle.trim(),
        icon: projectDraft.emoji,
        color: projectColors[next.projects.length % projectColors.length],
        status: toPersistedStatus(projectDraft.status),
        progress: 0,
        weeklyHours: Math.max(0, Math.min(40, Number(projectDraft.weeklyHours) || 0)),
        githubRepo: projectDraft.githubRepo.trim() || null,
        remoteRepo: projectDraft.githubRepo.trim() || null,
        localRepoPath: projectDraft.localRepoPath || null,
        healthScore: null,
        archivedAt: projectDraft.status === "Archived" ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
        tasks: []
      } as Project);
      setSelectedId(id);
      push("Project created.", "success");
    } else if (editingProjectId) {
      const project = next.projects.find((item) => item.id === editingProjectId);
      if (!project) return;
      const previousName = project.name;
      project.name = projectDraft.name.trim();
      project.subtitle = projectDraft.subtitle.trim();
      project.icon = projectDraft.emoji;
      project.status = toPersistedStatus(projectDraft.status);
      project.weeklyHours = Math.max(0, Math.min(40, Number(projectDraft.weeklyHours) || 0));
      project.githubRepo = projectDraft.githubRepo.trim() || null;
      project.remoteRepo = projectDraft.githubRepo.trim() || null;
      project.localRepoPath = projectDraft.localRepoPath || null;
      (project as any).updatedAt = nowIso;

      next.roadmapCards = next.roadmapCards.map((card) => {
        if (!card.project) return card;
        if (card.project === previousName) {
          return { ...card, project: project.id, updatedAt: nowIso };
        }
        return card;
      });
      push("Project updated.", "success");
    }

    await save(next);
    setProjectModalOpen(false);
  };

  const setProjectArchived = async (projectId: string, archived: boolean) => {
    const next = { ...state };
    const project = next.projects.find((item) => item.id === projectId);
    if (!project) return;
    project.status = archived ? "Archived" : "In Progress";
    project.archivedAt = archived ? new Date().toISOString() : null;
    project.updatedAt = new Date().toISOString();
    await save(next);
    push(archived ? "Project archived." : "Project restored.", "success");
    setOpenProjectMenu(null);
  };

  const deleteProject = async (projectId: string) => {
    const confirmed = window.confirm("Delete this project permanently? This cannot be undone.");
    if (!confirmed) return;
    const next = { ...state };
    next.projects = next.projects.filter((project) => project.id !== projectId);
    next.journalEntries = next.journalEntries.map((entry) =>
      entry.projectId === projectId ? { ...entry, projectId: null } : entry
    );
    next.insights = next.insights.map((insight) =>
      insight.projectId === projectId ? { ...insight, projectId: null } : insight
    );
    next.roadmapCards = next.roadmapCards.map((card) =>
      card.project === projectId ? { ...card, project: null } : card
    );
    await save(next);
    if (selectedId === projectId) setSelectedId(null);
    setOpenProjectMenu(null);
    push("Project deleted.", "success");
  };

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
    push("Goal template saved.", "success");
  };

  const addTask = async () => {
    if (!selectedProject || !taskText.trim()) return;
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    project.tasks.unshift({
      id: crypto.randomUUID(),
      text: taskText.trim(),
      done: false,
      status: "todo",
      dependsOnIds: [],
      priority: taskPriority,
      dueDate: taskDue || null,
      milestone: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      linkedCommit: null
    });
    setTaskText("");
    setTaskDue("");
    setTaskPriority("med");
    await save(next);
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;

    task.done = done;
    task.status = done ? "done" : "todo";
    task.completedAt = done ? new Date().toISOString() : null;

    if (done && selectedProject.githubRepo && state.github.loggedIn) {
      try {
        const result = await api.githubCommitMatch(selectedProject.githubRepo, task.text);
        task.linkedCommit = result.match ?? null;
      } catch {
        task.linkedCommit = null;
      }
    }

    if (!done) task.linkedCommit = null;
    await save(next);
  };

  const updateTaskStatus = async (taskId: string, status: "todo" | "doing" | "done") => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;

    if (status === "doing" && isTaskBlocked(task, project.tasks)) {
      const allow = window.confirm("This task is blocked. Mark it as doing anyway?");
      if (!allow) return;
    }

    task.status = status;
    task.done = status === "done";
    task.completedAt = status === "done" ? new Date().toISOString() : null;
    await save(next);
  };

  const updateTaskDependencies = async (taskId: string, deps: string[]) => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.dependsOnIds = deps;
    await save(next);
  };

  const updateTaskPriority = async (taskId: string, priority: "low" | "med" | "high") => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.priority = priority;
    await save(next);
  };

  const adjustHours = async (projectId: string, delta: number) => {
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    project.weeklyHours = Math.max(0, Math.min(40, project.weeklyHours + delta));
    await save(next);
  };

  const loadCommits = async () => {
    const repo = selectedProject?.remoteRepo ?? selectedProject?.githubRepo;
    if (!repo) {
      push("Link a GitHub repo first.", "warning");
      return;
    }
    try {
      const response = await api.githubCommits(repo, "main", 8);
      setCommitFeed(response.commits ?? []);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load commits.", "error");
    }
  };

  const setProjectRepo = async () => {
    if (!selectedProject) return;
    const next = { ...state };
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    project.githubRepo = remoteRepoInput.trim() || null;
    project.remoteRepo = remoteRepoInput.trim() || null;
    await save(next);
    push("GitHub repo updated.", "success");
  };

  const linkLocalRepo = async () => {
    if (!selectedProject || !localRepoInput) return;
    try {
      await api.gitLink(selectedProject.id, localRepoInput);
      await refresh();
      push("Local repo linked.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to link local repo.", "error");
    }
  };

  const unlinkLocalRepo = async () => {
    if (!selectedProject) return;
    try {
      await api.gitUnlink(selectedProject.id);
      await refresh();
      setLocalCommitFeed([]);
      push("Local repo unlinked.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to unlink local repo.", "error");
    }
  };

  const loadLocalCommits = async () => {
    if (!selectedProject?.localRepoPath) return;
    try {
      const response = await api.gitLocalCommits(selectedProject.localRepoPath, 8);
      setLocalCommitFeed(response.commits ?? []);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load local commits.", "error");
    }
  };

  const onDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData("text/plain", id);
  };

  const onDropRoadmap = async (event: React.DragEvent, lane: RoadmapLane) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const next = { ...state };
    next.roadmapCards = next.roadmapCards.map((card) =>
      card.id === id ? { ...card, lane, updatedAt: new Date().toISOString() } : card
    );
    await save(next);
  };

  const generateAutoPlan = () => {
    const taskList = visibleProjects.flatMap((project) =>
      dedupeById(project.tasks).items.map((task) => ({ task, projectName: project.name }))
    );
    const boostProjectNames = new Set<string>();

    state.roadmapCards
      .filter((card) => card.lane === "now")
      .forEach((card) => {
        const mapped = resolveRoadmapProject(card.project, projects);
        if (mapped && (showArchived || !isArchivedProject(mapped))) {
          boostProjectNames.add(mapped.name);
        }
      });

    filteredInsights
      .filter((insight) => insight.projectId)
      .forEach((insight) => {
        const project = projects.find((item) => item.id === insight.projectId);
        if (project && (showArchived || !isArchivedProject(project))) {
          boostProjectNames.add(project.name);
        }
      });

    return computeTodayPlan(taskList, {
      boostProjectNames: Array.from(boostProjectNames),
      maxTasks: 6
    });
  };

  const persistTodayPlan = async (taskIds: string[], source: "auto" | "manual") => {
    const next = { ...state };
    next.todayPlanByDate[todayKey()] = {
      taskIds,
      generatedAt: new Date().toISOString(),
      source,
      notes: todayPlanNotes.trim() || null
    };
    await save(next);
    push(source === "auto" ? "Today plan auto-generated." : "Today plan saved.", "success");
  };

  const autoGenerateTodayPlan = async () => {
    const generated = generateAutoPlan();
    setTodayPlanDraft(generated);
    await persistTodayPlan(generated, "auto");
  };

  const movePlanItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= todayPlanDraft.length) return;
    const next = [...todayPlanDraft];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setTodayPlanDraft(next);
  };

  const removePlanItem = (taskId: string) => {
    setTodayPlanDraft((prev) => prev.filter((id) => id !== taskId));
  };

  const addPlanItem = (taskId: string) => {
    setTodayPlanDraft((prev) => [...prev, taskId]);
    setTodayTaskQuery("");
  };

  const startFocus = () => {
    push("Action requires server support: /api/tools/focus/start", "warning");
  };

  const saveTodayPlan = async () => {
    await persistTodayPlan(todayPlanDraft, "manual");
  };

  const runInsightAction = async (group: InsightGroup, action: "task" | "focus" | "move-now" | "open" | "copy" | "snooze-1d" | "snooze-1w") => {
    const next = { ...state };

    if (action === "task") {
      const targetProjectId = group.projectId ?? selectedProject?.id ?? null;
      if (!targetProjectId) {
        push("Action requires server support: /api/insights/action", "warning");
        return;
      }
      const project = next.projects.find((candidate) => candidate.id === targetProjectId);
      if (!project) {
        push("Action requires server support: /api/insights/action", "warning");
        return;
      }
      project.tasks.unshift({
        id: crypto.randomUUID(),
        text: `Follow up: ${group.title}`,
        done: false,
        status: "todo",
        dependsOnIds: [],
        priority: "high",
        dueDate: null,
        milestone: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        linkedCommit: null
      });
      await save(next);
      push("Task created.", "success");
      return;
    }

    if (action === "focus") {
      next.focusSessions.unshift({
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        durationMinutes: 45,
        completedAt: null,
        planned: true,
        projectId: group.projectId,
        reason: group.title
      });
      await save(next);
      push("Focus session scheduled.", "success");
      return;
    }

    if (action === "move-now") {
      const project = group.projectId ? next.projects.find((candidate) => candidate.id === group.projectId) : null;
      const card = next.roadmapCards.find(
        (item) => item.lane !== "now" && (!project || isRoadmapCardForProject(item, project, next.projects))
      );
      if (!card) {
        push("No roadmap card available to move.", "warning");
        return;
      }
      card.lane = "now";
      card.updatedAt = new Date().toISOString();
      await save(next);
      push("Roadmap card moved to Now.", "success");
      return;
    }

    if (action === "copy") {
      const path = resolveRepoPath(group, selectedProject, repoById, repoByPath);
      if (!path) {
        push("No repo path available for this insight.", "warning");
        return;
      }
      await navigator.clipboard.writeText(path);
      push("Repo path copied.", "success");
      return;
    }

    if (action === "open") {
      push("Action requires server support: /api/local-git/open", "warning");
      return;
    }

    const days = action === "snooze-1d" ? 1 : 7;
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    next.insights = next.insights.map((insight) =>
      group.items.find((item) => item.id === insight.id)
        ? { ...insight, dismissedUntil: until, updatedAt: new Date().toISOString() }
        : insight
    );
    await save(next);
    push(days === 1 ? "Insight snoozed for 1 day." : "Insight snoozed for 1 week.", "success");
  };

  const openCreateJournalModal = () => {
    setEditingJournalId(null);
    setJournalDraft(emptyJournalDraft);
    setJournalModalOpen(true);
  };

  const openEditJournalModal = (entry: (typeof state.journalEntries)[number]) => {
    setEditingJournalId(entry.id);
    setJournalDraft({
      type: entry.type,
      title: entry.title ?? "",
      body: entry.body,
      tags: (entry.tags ?? []).join(", "),
      taskIds: entry.links.taskIds,
      roadmapCardIds: entry.links.roadmapCardIds,
      commitShas: (entry.links.commitShas ?? []).join(", ")
    });
    setJournalModalOpen(true);
  };

  const saveJournalEntry = async () => {
    if (!journalDraft.body.trim()) {
      push("Journal body is required.", "error");
      return;
    }
    const nowIso = new Date().toISOString();
    const next = { ...state };
    const entry = {
      id: editingJournalId ?? crypto.randomUUID(),
      projectId: selectedProject?.id ?? null,
      ts: nowIso,
      type: journalDraft.type,
      title: journalDraft.title.trim() || null,
      body: journalDraft.body.trim(),
      links: {
        taskIds: journalDraft.taskIds,
        roadmapCardIds: journalDraft.roadmapCardIds,
        repoIds: selectedProject?.localRepoPath
          ? [repoByPath.get(selectedProject.localRepoPath)?.id].filter((value): value is string => Boolean(value))
          : [],
        commitShas: journalDraft.commitShas
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      },
      tags: journalDraft.tags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      createdAt: editingJournalId
        ? next.journalEntries.find((item) => item.id === editingJournalId)?.createdAt ?? nowIso
        : nowIso,
      updatedAt: nowIso
    };

    if (editingJournalId) {
      next.journalEntries = next.journalEntries.map((item) => (item.id === editingJournalId ? entry : item));
      push("Journal entry updated.", "success");
    } else {
      next.journalEntries.unshift(entry);
      push("Journal entry added.", "success");
    }

    await save(next);
    setJournalModalOpen(false);
    setEditingJournalId(null);
    setJournalDraft(emptyJournalDraft);
  };

  const removeJournalEntry = async (entryId: string) => {
    const confirmed = window.confirm("Delete this journal entry?");
    if (!confirmed) return;
    const next = { ...state };
    next.journalEntries = next.journalEntries.filter((entry) => entry.id !== entryId);
    await save(next);
    push("Journal entry deleted.", "success");
  };

  return (
    <div className="grid gap-6">
      <GlassPanel variant="hero">
        <SectionHeader
          eyebrow="Today"
          title="Daily Goals"
          subtitle={dateLabel}
          rightControls={
            <div className="flex items-center gap-2">
              <Pill tone="accent">Score {todayEntry?.score ?? 0}%</Pill>
              <Pill tone="success">
                {todayEntry?.completedPoints ?? 0}/{todayEntry?.goals.length ?? 0}
              </Pill>
            </div>
          }
        />
        <div className="mt-4 grid gap-2">
          {(todayEntry?.goals ?? []).slice(0, 5).map((goal) => (
            <label key={goal.id} className="table-row">
              <div>
                <div className="text-sm font-medium">{goal.title}</div>
                <div className="text-xs text-white/50">{goal.category}</div>
              </div>
              <input type="checkbox" checked={goal.done} readOnly aria-label={`Goal ${goal.title} status`} />
            </label>
          ))}
          {(todayEntry?.goals.length ?? 0) === 0 && (
            <p className="text-sm text-white/60">No goals yet for today.</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="button-secondary" onClick={handleAddGoal} aria-label="Add goal">
            Add Goal
          </button>
          <button className="button-secondary" onClick={handleSaveTemplate} aria-label="Save goals as template">
            Save as Template
          </button>
        </div>
      </GlassPanel>

      <GlassPanel variant="standard">
        <SectionHeader
          eyebrow="Workstreams"
          title="Projects"
          subtitle={`${visibleProjects.length} visible${showArchived ? ` · ${projects.length} total` : ""}`}
          rightControls={
            <label className="toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                aria-label="Show archived projects"
              />
              Show archived
            </label>
          }
        />
        <section className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {visibleProjects.map((project) => {
            const tasksDone = project.tasks.filter((task) => task.done).length;
            const tasksTotal = project.tasks.length;
            const progress = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : project.progress;
            const repo = project.localRepoPath ? repoByPath.get(project.localRepoPath) : null;
            const dirty = repo?.dirty ?? false;
            const active = repo?.todayCommitCount ?? 0;
            const isSelected = selectedProject?.id === project.id;

            return (
              <button
                key={project.id}
                className={`card hover-lift relative text-left ${isSelected ? "accent-glow" : ""}`}
                onClick={() => setSelectedId(project.id)}
                aria-label={`Select project ${project.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl">{project.icon}</div>
                    <h4 className="mt-2 text-base font-semibold">{project.name}</h4>
                    <p className="text-xs text-white/50">{project.subtitle || "No subtitle"}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <ProgressRing value={progress} />
                    <div className="relative">
                      <button
                        className="button-secondary h-8 w-8 rounded-lg px-0 py-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenProjectMenu((prev) => (prev === project.id ? null : project.id));
                        }}
                        aria-label={`Open ${project.name} menu`}
                      >
                        ...
                      </button>
                      {openProjectMenu === project.id && (
                        <div className="absolute right-0 z-20 mt-2 min-w-[190px] rounded-xl border border-white/10 bg-[#0a0d14] p-2 shadow-2xl">
                          <button
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                            onClick={() => openEditProjectModal(project)}
                          >
                            Edit project
                          </button>
                          <button
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                            onClick={() => setProjectArchived(project.id, !isArchivedProject(project))}
                          >
                            {isArchivedProject(project) ? "Restore" : "Archive"}
                          </button>
                          <button
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/20"
                            onClick={() => deleteProject(project.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Pill tone={isArchivedProject(project) ? "warning" : "neutral"}>
                    {toUiStatus(project.status)}
                  </Pill>
                  <span className="text-xs text-white/60">{project.weeklyHours}h/week</span>
                </div>
                <div className="mt-2 text-xs text-white/60">Tasks: {tasksDone}/{tasksTotal}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                  <span>{active} commits today</span>
                  {dirty && <Pill tone="warning">Dirty tree</Pill>}
                </div>
                <div
                  className="absolute inset-x-0 bottom-0 h-1 rounded-b-xl"
                  style={{ background: project.color, opacity: isSelected ? 0.6 : 0.25 }}
                />
              </button>
            );
          })}

          <button
            className="card hover-lift border-dashed border-white/20 text-center"
            onClick={openCreateProjectModal}
            aria-label="Add project"
          >
            <div className="text-2xl">+</div>
            <div className="mt-3 text-sm font-medium">Add Project</div>
            <p className="mt-1 text-xs text-white/50">Create a new workstream</p>
          </button>
        </section>
      </GlassPanel>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassPanel variant="hero" className="accent-glow">
          {selectedProject ? (
            <div className="grid gap-4">
              <SectionHeader
                eyebrow="Selected Project"
                title={`${selectedProject.icon} ${selectedProject.name}`}
                subtitle={selectedProject.subtitle || "No subtitle"}
                rightControls={<Pill tone="accent">{toUiStatus(selectedProject.status)}</Pill>}
              />

              {selectedProjectInsights.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-[0.28em] text-white/50">Live signals</div>
                  <div className="mt-2 grid gap-2">
                    {selectedProjectInsights.slice(0, 3).map((insight) => (
                      <div key={insight.id} className="table-row text-xs">
                        <span>{insight.title}</span>
                        <Pill tone={insight.severity === "crit" ? "danger" : insight.severity === "warn" ? "warning" : "neutral"}>
                          {insight.severity}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

              {activeTab === "Tasks" && (
                <div className="grid gap-3">
                  {selectedTasks.length === 0 && <p className="text-sm text-white/60">No tasks yet.</p>}
                  {selectedTasks.map((task) => {
                    const blocked = isTaskBlocked(task, selectedTasks);
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
                          onToggle={(nextValue) => toggleTask(task.id, nextValue)}
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                          <label className="flex items-center gap-2">
                            Status
                            <select
                              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs"
                              value={task.status}
                              onChange={(event) => updateTaskStatus(task.id, event.target.value as "todo" | "doing" | "done")}
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
                              onChange={(event) => updateTaskPriority(task.id, event.target.value as "low" | "med" | "high")}
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
                                  Array.from(event.target.selectedOptions).map((option) => option.value)
                                )
                              }
                            >
                              {selectedTasks
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
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_130px_140px_120px_auto]">
                    <input
                      className="input"
                      placeholder="Add a task..."
                      value={taskText}
                      onChange={(event) => setTaskText(event.target.value)}
                      aria-label="Task text"
                    />
                    <select
                      className="input"
                      value={taskPriority}
                      onChange={(event) => setTaskPriority(event.target.value as "low" | "med" | "high")}
                      aria-label="Task priority"
                    >
                      <option value="low">Low</option>
                      <option value="med">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <input
                      className="input"
                      type="date"
                      value={taskDue}
                      onChange={(event) => setTaskDue(event.target.value)}
                      aria-label="Task due date"
                    />
                    <span className="chip self-center">{selectedTasks.length} tasks</span>
                    <button className="button-primary" onClick={addTask} aria-label="Add task">
                      Add
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "Roadmap" && (
                <div className="grid gap-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {lanes.map((lane) => (
                      <div
                        key={lane.key}
                        className="rounded-xl border border-white/10 bg-white/5 p-2"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => onDropRoadmap(event, lane.key)}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-sm font-semibold">{lane.label}</h4>
                          <Pill>{filteredRoadmap.filter((card) => card.lane === lane.key).length}</Pill>
                        </div>
                        <div className="grid min-h-[120px] gap-2">
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
                                {card.tags.length > 0 && <div className="text-white/50">{card.tags.join(", ")}</div>}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "GitHub" && (
                <div className="grid gap-4">
                  <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs uppercase tracking-[0.28em] text-white/50">Local repo</div>
                    {selectedProject.localRepoPath ? (
                      <div className="grid gap-2">
                        <div className="text-sm font-medium">{repoByPath.get(selectedProject.localRepoPath)?.name ?? "Linked"}</div>
                        <div className="text-xs text-white/60">{selectedProject.localRepoPath}</div>
                        <div className="flex flex-wrap gap-2">
                          <button className="button-secondary" onClick={loadLocalCommits} aria-label="Load local commits">
                            Load Local Commits
                          </button>
                          <button className="button-secondary" onClick={unlinkLocalRepo} aria-label="Unlink local repo">
                            Unlink
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <select
                          className="input"
                          value={localRepoInput}
                          onChange={(event) => setLocalRepoInput(event.target.value)}
                          aria-label="Select local repository"
                        >
                          <option value="">Select local repo</option>
                          {uniqueRepos.map((repo) => (
                            <option key={repo.id} value={repo.path}>
                              {repo.name} - {repo.path}
                            </option>
                          ))}
                        </select>
                        <button className="button-secondary" onClick={linkLocalRepo} aria-label="Link local repository">
                          Link
                        </button>
                      </div>
                    )}
                    {localCommitFeed.length > 0 && (
                      <div className="grid gap-2">
                        {localCommitFeed.map((commit) => (
                          <div key={commit.sha} className="table-row">
                            <div>
                              <div className="text-sm font-medium">{commit.message}</div>
                              <div className="text-xs text-white/50">{commit.author} - {commit.shortSha}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs uppercase tracking-[0.28em] text-white/50">GitHub repo</div>
                    <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                      <input
                        className="input"
                        placeholder="owner/repo"
                        value={remoteRepoInput}
                        list="github-repo-list"
                        onChange={(event) => setRemoteRepoInput(event.target.value)}
                        aria-label="GitHub repository"
                      />
                      <datalist id="github-repo-list">
                        {githubRepoOptions.map((repo) => (
                          <option key={repo} value={repo} />
                        ))}
                      </datalist>
                      <button className="button-secondary" onClick={setProjectRepo} aria-label="Save GitHub repository">
                        Save
                      </button>
                      <button className="button-secondary" onClick={loadCommits} aria-label="Load GitHub commits">
                        Load
                      </button>
                    </div>
                    {commitFeed.length === 0 && (
                      <p className="text-sm text-white/60">No GitHub commits loaded.</p>
                    )}
                    {commitFeed.length > 0 && (
                      <div className="grid gap-2">
                        {commitFeed.map((commit) => (
                          <div key={commit.sha} className="table-row">
                            <div>
                              <div className="text-sm font-medium">{commit.message}</div>
                              <div className="text-xs text-white/50">{commit.author} - {commit.shortSha}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "Journal" && (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <input
                      className="input max-w-sm"
                      placeholder="Search project journal..."
                      value={journalQuery}
                      onChange={(event) => setJournalQuery(event.target.value)}
                      aria-label="Search journal entries"
                    />
                    <button className="button-primary" onClick={openCreateJournalModal} aria-label="Create journal entry">
                      Add Entry
                    </button>
                  </div>
                  {projectJournalEntries.length === 0 && (
                    <p className="text-sm text-white/60">No journal entries for this project yet.</p>
                  )}
                  <div className="grid gap-2">
                    {projectJournalEntries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Pill tone="accent">{entry.type}</Pill>
                            <span className="text-xs text-white/50">{formatDate(entry.ts)}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="button-secondary"
                              onClick={() => openEditJournalModal(entry)}
                              aria-label="Edit journal entry"
                            >
                              Edit
                            </button>
                            <button
                              className="button-secondary"
                              onClick={() => removeJournalEntry(entry.id)}
                              aria-label="Delete journal entry"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm font-semibold">{entry.title || "Untitled"}</div>
                        <p className="mt-1 text-sm text-white/70 whitespace-pre-wrap">{entry.body}</p>
                        {entry.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {entry.tags.map((tag) => (
                              <Pill key={tag}>{tag}</Pill>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "Settings" && (
                <div className="grid gap-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs text-white/60">Status</span>
                      <select
                        className="input"
                        value={toUiStatus(selectedProject.status)}
                        onChange={async (event) => {
                          const next = { ...state };
                          const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
                          if (!project) return;
                          project.status = toPersistedStatus(event.target.value as UiProjectStatus);
                          await save(next);
                        }}
                        aria-label="Project status"
                      >
                        {uiStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-white/60">Weekly Hours</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        max={40}
                        value={selectedProject.weeklyHours}
                        onChange={async (event) => {
                          const next = { ...state };
                          const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
                          if (!project) return;
                          project.weeklyHours = Math.max(0, Math.min(40, Number(event.target.value) || 0));
                          await save(next);
                        }}
                        aria-label="Weekly hours"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="button-secondary" onClick={() => openEditProjectModal(selectedProject)} aria-label="Open project edit modal">
                      Edit Project Details
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() => setProjectArchived(selectedProject.id, !isArchivedProject(selectedProject))}
                      aria-label="Archive project"
                    >
                      {isArchivedProject(selectedProject) ? "Restore" : "Archive"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-red-300/20 bg-red-500/10 p-3">
                    <div className="text-sm font-semibold text-red-100">Danger Zone</div>
                    <p className="mt-1 text-xs text-red-100/70">Delete is permanent and cannot be undone.</p>
                    <button
                      className="button-secondary mt-3 border-red-300/30 text-red-100"
                      onClick={() => deleteProject(selectedProject.id)}
                      aria-label="Delete project permanently"
                    >
                      Delete Project
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/60">Create a project to start planning.</p>
          )}
        </GlassPanel>

        <GlassPanel variant="standard">
          <SectionHeader
            eyebrow="Capacity"
            title="Weekly Time Budget"
            subtitle={`${totalHours}h / week`}
            rightControls={<Pill tone="accent">{tasksProgress}% completion</Pill>}
          />
          <div className="mt-4">
            <StackedBar segments={visibleProjects.map((project) => ({ color: project.color, value: project.weeklyHours }))} />
          </div>
          <div className="mt-4 grid gap-3">
            {visibleProjects.map((project) => (
              <div key={project.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
                  <span>{project.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="h-7 w-7 rounded-md border border-white/10 bg-white/10"
                    onClick={() => adjustHours(project.id, -1)}
                    aria-label={`Decrease ${project.name} weekly hours`}
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-white/60">{project.weeklyHours}h</span>
                  <button
                    className="h-7 w-7 rounded-md border border-white/10 bg-white/10"
                    onClick={() => adjustHours(project.id, 1)}
                    aria-label={`Increase ${project.name} weekly hours`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            {visibleProjects.length === 0 && <p className="text-sm text-white/60">No active projects to budget.</p>}
          </div>
        </GlassPanel>
      </section>

      <GlassPanel variant="standard">
        <SectionHeader
          eyebrow="Signals"
          title="Insights → Actions"
          subtitle="Grouped by rule and target"
          rightControls={
            <div className="flex flex-wrap gap-2">
              <button
                className={insightFilter === "priority" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("priority")}
                aria-label="Filter critical and warnings"
              >
                Critical + Warnings
              </button>
              <button
                className={insightFilter === "all" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("all")}
                aria-label="Filter all insights"
              >
                All
              </button>
              <button
                className={insightFilter === "crit" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("crit")}
                aria-label="Filter critical insights"
              >
                Critical
              </button>
              <button
                className={insightFilter === "warn" ? "button-primary" : "button-secondary"}
                onClick={() => setInsightFilter("warn")}
                aria-label="Filter warnings"
              >
                Warnings
              </button>
            </div>
          }
        />

        <div className="mt-4 grid gap-3">
          {groupedInsights.length === 0 && <p className="text-sm text-white/60">No insights right now.</p>}
          {groupedInsights.map((group) => {
            const project = group.projectId ? projects.find((item) => item.id === group.projectId) : null;
            const repo = group.repoId ? repoById.get(group.repoId) : null;
            return (
              <GlassPanel key={group.key} variant="standard" className="p-0">
                <details className="group" open={group.severity === "crit"}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {group.title} {group.items.length > 1 ? `x${group.items.length}` : ""}
                      </div>
                      <div className="text-xs text-white/60">{group.reason}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {project && <Pill tone="accent">{project.name}</Pill>}
                        {repo && <Pill>{repo.name}</Pill>}
                      </div>
                    </div>
                    <Pill tone={group.severity === "crit" ? "danger" : group.severity === "warn" ? "warning" : "neutral"}>
                      {group.severity}
                    </Pill>
                  </summary>
                  <div className="border-t border-white/10 px-4 pb-4">
                    <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-white/50">Why?</summary>
                      <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-2 text-xs text-white/70">
                        {JSON.stringify(group.items.map((item) => item.metrics), null, 2)}
                      </pre>
                    </details>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="button-secondary" onClick={() => runInsightAction(group, "task")}>
                        Create Task
                      </button>
                      <button className="button-secondary" onClick={() => runInsightAction(group, "focus")}>
                        Schedule Focus
                      </button>
                      <button className="button-secondary" onClick={() => runInsightAction(group, "move-now")}>
                        Move Roadmap Card to Now
                      </button>
                      <button className="button-secondary" onClick={() => runInsightAction(group, "open")}>
                        Open Repo
                      </button>
                      <button className="button-secondary" onClick={() => runInsightAction(group, "copy")}>
                        Copy Repo Path
                      </button>
                      <button className="button-secondary" onClick={() => runInsightAction(group, "snooze-1d")}>
                        Snooze 1 day
                      </button>
                      <button className="button-secondary" onClick={() => runInsightAction(group, "snooze-1w")}>
                        Snooze 1 week
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
          eyebrow="Local Git"
          title="Status Strip"
          subtitle={`${uniqueRepos.length} repos monitored`}
          rightControls={
            <Pill tone={scanErrorCount > 0 ? "warning" : "neutral"}>
              {lastScanAt ? `Last scan ${formatDate(lastScanAt)}` : "No scan yet"}
            </Pill>
          }
        />
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/60">
          <span>Active today: {uniqueRepos.filter((repo) => repo.todayCommitCount > 0).length}</span>
          <span>Dirty trees: {uniqueRepos.filter((repo) => repo.dirty).length}</span>
          {scanErrorCount > 0 && <span className="text-amber-200">Errors: {scanErrorCount}</span>}
        </div>
      </GlassPanel>

      <GlassPanel variant="standard">
        <SectionHeader
          eyebrow="Focus"
          title="Today Plan"
          subtitle="Auto-generate, then tune quickly"
          rightControls={
            <button className="button-secondary" onClick={autoGenerateTodayPlan} aria-label="Auto-generate today plan">
              Auto-generate
            </button>
          }
        />

        <div className="mt-4 grid gap-2">
          {todayPlanDraft.length === 0 && <p className="text-sm text-white/60">No tasks selected yet.</p>}
          {todayPlanDraft.map((taskId, index) => {
            const project = visibleProjects.find((candidate) => candidate.tasks.some((task) => task.id === taskId));
            const task = project?.tasks.find((candidate) => candidate.id === taskId);
            if (!task || !project) return null;
            return (
              <div key={taskId} className="table-row">
                <div>
                  <div className="text-sm font-medium">{task.text}</div>
                  <div className="text-xs text-white/50">{project.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={task.priority === "high" ? "danger" : task.priority === "med" ? "warning" : "neutral"}>
                    {task.priority}
                  </Pill>
                  {index === 0 && (
                    <button className="button-secondary" onClick={startFocus} aria-label="Start focus on top task">
                      Start Focus
                    </button>
                  )}
                  <button
                    className="button-secondary"
                    onClick={() => movePlanItem(index, -1)}
                    disabled={index === 0}
                    aria-label="Move task up"
                  >
                    Up
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => movePlanItem(index, 1)}
                    disabled={index === todayPlanDraft.length - 1}
                    aria-label="Move task down"
                  >
                    Down
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => removePlanItem(taskId)}
                    aria-label="Remove task from plan"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-xs text-white/60">Add from tasks</label>
          <input
            className="input"
            value={todayTaskQuery}
            onChange={(event) => setTodayTaskQuery(event.target.value)}
            placeholder="Search tasks to add..."
            aria-label="Search tasks for today plan"
          />
          <div className="grid max-h-40 gap-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
            {todayTaskOptions.slice(0, 12).map((task) => (
              <button
                key={task.id}
                className="table-row text-left"
                onClick={() => addPlanItem(task.id)}
                aria-label={`Add ${task.text} to plan`}
              >
                <span>
                  {task.projectName}: {task.text}
                </span>
                <Pill tone={task.priority === "high" ? "danger" : task.priority === "med" ? "warning" : "neutral"}>
                  {task.priority}
                </Pill>
              </button>
            ))}
            {todayTaskOptions.length === 0 && (
              <p className="text-sm text-white/60">No matching tasks available.</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            placeholder="Notes for today..."
            value={todayPlanNotes}
            onChange={(event) => setTodayPlanNotes(event.target.value)}
            aria-label="Today plan notes"
          />
          <button className="button-primary" onClick={saveTodayPlan} aria-label="Save today plan">
            Save Plan
          </button>
        </div>

        {todayPlan && (
          <p className="mt-3 text-xs text-white/50">
            Last saved {formatDate(todayPlan.generatedAt)} ({todayPlan.source})
          </p>
        )}
      </GlassPanel>

      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={projectModalMode === "create" ? "Create Project" : "Edit Project"}
        footer={
          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={() => setProjectModalOpen(false)} aria-label="Cancel project modal">
              Cancel
            </button>
            <button className="button-primary" onClick={saveProjectDraft} aria-label="Save project">
              {projectModalMode === "create" ? "Create" : "Save"}
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">Emoji</label>
            <EmojiPicker
              value={projectDraft.emoji}
              onChange={(emoji) => setProjectDraft((prev) => ({ ...prev, emoji }))}
            />
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Name</span>
            <input
              className="input"
              value={projectDraft.name}
              onChange={(event) => setProjectDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Project name"
              aria-label="Project name"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Subtitle</span>
            <input
              className="input"
              value={projectDraft.subtitle}
              onChange={(event) => setProjectDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
              placeholder="Optional subtitle"
              aria-label="Project subtitle"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs text-white/60">Status</span>
              <select
                className="input"
                value={projectDraft.status}
                onChange={(event) =>
                  setProjectDraft((prev) => ({ ...prev, status: event.target.value as UiProjectStatus }))
                }
                aria-label="Project status"
              >
                {uiStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-white/60">Weekly Hours</span>
              <div className="grid grid-cols-[40px_1fr_40px] gap-2">
                <button
                  className="button-secondary px-0"
                  onClick={() =>
                    setProjectDraft((prev) => ({ ...prev, weeklyHours: Math.max(0, prev.weeklyHours - 1) }))
                  }
                  aria-label="Decrease weekly hours"
                >
                  -
                </button>
                <input
                  className="input text-center"
                  type="number"
                  min={0}
                  max={40}
                  value={projectDraft.weeklyHours}
                  onChange={(event) =>
                    setProjectDraft((prev) => ({
                      ...prev,
                      weeklyHours: Math.max(0, Math.min(40, Number(event.target.value) || 0))
                    }))
                  }
                  aria-label="Weekly hours"
                />
                <button
                  className="button-secondary px-0"
                  onClick={() =>
                    setProjectDraft((prev) => ({ ...prev, weeklyHours: Math.min(40, prev.weeklyHours + 1) }))
                  }
                  aria-label="Increase weekly hours"
                >
                  +
                </button>
              </div>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs text-white/60">Local Repo</span>
              <select
                className="input"
                value={projectDraft.localRepoPath}
                onChange={(event) =>
                  setProjectDraft((prev) => ({ ...prev, localRepoPath: event.target.value }))
                }
                aria-label="Local repository"
              >
                <option value="">Not linked</option>
                {uniqueRepos.map((repo) => (
                  <option key={repo.id} value={repo.path}>
                    {repo.name} - {repo.path}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-white/60">GitHub Repo</span>
              <input
                className="input"
                value={projectDraft.githubRepo}
                list="project-modal-github-list"
                onChange={(event) =>
                  setProjectDraft((prev) => ({ ...prev, githubRepo: event.target.value }))
                }
                placeholder="owner/repo"
                aria-label="GitHub repository"
              />
              <datalist id="project-modal-github-list">
                {githubRepoOptions.map((repo) => (
                  <option key={repo} value={repo} />
                ))}
              </datalist>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={journalModalOpen}
        onClose={() => setJournalModalOpen(false)}
        title={editingJournalId ? "Edit Journal Entry" : "Add Journal Entry"}
        footer={
          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={() => setJournalModalOpen(false)} aria-label="Cancel journal modal">
              Cancel
            </button>
            <button className="button-primary" onClick={saveJournalEntry} aria-label="Save journal entry">
              Save
            </button>
          </div>
        }
      >
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Type</span>
            <select
              className="input"
              value={journalDraft.type}
              onChange={(event) =>
                setJournalDraft((prev) => ({
                  ...prev,
                  type: event.target.value as "note" | "decision" | "blocker" | "next" | "idea"
                }))
              }
              aria-label="Journal type"
            >
              <option value="note">Note</option>
              <option value="decision">Decision</option>
              <option value="blocker">Blocker</option>
              <option value="next">Next</option>
              <option value="idea">Idea</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Title</span>
            <input
              className="input"
              value={journalDraft.title}
              onChange={(event) => setJournalDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Optional title"
              aria-label="Journal title"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Body</span>
            <textarea
              className="input"
              rows={4}
              value={journalDraft.body}
              onChange={(event) => setJournalDraft((prev) => ({ ...prev, body: event.target.value }))}
              placeholder="Capture what happened..."
              aria-label="Journal body"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Tags (comma separated)</span>
            <input
              className="input"
              value={journalDraft.tags}
              onChange={(event) => setJournalDraft((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="launch, blocker, infra"
              aria-label="Journal tags"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Link Tasks</span>
            <select
              multiple
              className="input"
              value={journalDraft.taskIds}
              onChange={(event) =>
                setJournalDraft((prev) => ({
                  ...prev,
                  taskIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                }))
              }
              aria-label="Link tasks"
            >
              {selectedTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.text}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Link Roadmap Cards</span>
            <select
              multiple
              className="input"
              value={journalDraft.roadmapCardIds}
              onChange={(event) =>
                setJournalDraft((prev) => ({
                  ...prev,
                  roadmapCardIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                }))
              }
              aria-label="Link roadmap cards"
            >
              {filteredRoadmap.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Commit SHAs (comma separated)</span>
            <input
              className="input"
              value={journalDraft.commitShas}
              onChange={(event) => setJournalDraft((prev) => ({ ...prev, commitShas: event.target.value }))}
              placeholder="a1b2c3d, e4f5g6h"
              aria-label="Commit SHAs"
            />
          </label>
        </div>
      </Modal>
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
        items: [insight]
      });
    } else {
      existing.items.push(insight);
      if (severityRank(insight.severity) > severityRank(existing.severity)) {
        existing.severity = insight.severity;
      }
      if (!existing.projectId && insight.projectId) existing.projectId = insight.projectId;
      if (!existing.repoId && insight.repoId) existing.repoId = insight.repoId;
    }
  }
  return Array.from(map.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (map.has(item.id)) {
      duplicates.push(item.id);
      continue;
    }
    map.set(item.id, item);
  }
  return { items: Array.from(map.values()), duplicates };
}

function dedupeLocalRepos(repos: LocalRepo[]) {
  const byId = dedupeById(repos);
  const map = new Map<string, LocalRepo>();
  const duplicates = [...byId.duplicates];
  for (const repo of byId.items) {
    const existing = map.get(repo.path);
    if (!existing) {
      map.set(repo.path, repo);
      continue;
    }
    duplicates.push(repo.id);
    const existingTime = existing.scannedAt ? new Date(existing.scannedAt).getTime() : 0;
    const nextTime = repo.scannedAt ? new Date(repo.scannedAt).getTime() : 0;
    if (nextTime >= existingTime) {
      map.set(repo.path, repo);
    }
  }
  return { items: Array.from(map.values()), duplicates };
}

function toUiStatus(status: Project["status"]): UiProjectStatus {
  if (status === "Done") return "Done";
  if (status === "In Progress") return "In Progress";
  if (status === "Not Started") return "Not Started";
  return "Archived";
}

function toPersistedStatus(status: UiProjectStatus): Project["status"] {
  if (status === "Archived") return "Archived";
  return status;
}

function isArchivedProject(project: Project) {
  return toUiStatus(project.status) === "Archived";
}

function resolveRoadmapProject(ref: string | null, projects: Project[]) {
  if (!ref) return null;
  return projects.find((project) => project.id === ref || project.name === ref) ?? null;
}

function isRoadmapCardForProject(card: RoadmapCard, project: Project | null, projects: Project[]) {
  if (!project || !card.project) return false;
  const ref = resolveRoadmapProject(card.project, projects);
  if (!ref) return card.project === project.name;
  return ref.id === project.id;
}

function resolveRepoPath(
  group: InsightGroup,
  selectedProject: Project | null,
  repoById: Map<string, LocalRepo>,
  repoByPath: Map<string, LocalRepo>
) {
  if (group.repoId) {
    const byId = repoById.get(group.repoId);
    if (byId) return byId.path;
  }
  if (selectedProject?.localRepoPath && repoByPath.get(selectedProject.localRepoPath)) {
    return selectedProject.localRepoPath;
  }
  return null;
}
