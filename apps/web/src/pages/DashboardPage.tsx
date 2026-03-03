import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  computeGoalMetrics,
  todayKey,
  type Insight,
  type LocalRepo,
  type Project,
  type ProjectTask,
  type RoadmapCard,
  type RoadmapLane,
  type SuggestedAction
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
import EmojiPicker from "../components/EmojiPicker";
import ProjectJournalPanel from "../components/ProjectJournalPanel";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { computeTodayPlan, isTaskBlocked } from "../lib/taskRules";
import { formatDate } from "../lib/date";
import { dedupeById, dedupeLocalRepos } from "../lib/collections";

const tabs = ["Tasks", "Roadmap", "GitHub", "Journal", "Project Settings"];
const uiStatuses = ["Not Started", "In Progress", "Review", "On Hold", "Done", "Archived"] as const;
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
  actions: SuggestedAction[];
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

const projectColors = ["#5DD8FF", "#78E3A4", "#F9A8D4", "#F59E0B", "#60A5FA", "#A78BFA", "#22D3EE"];
const defaultProjectDraft: ProjectDraft = {
  emoji: "🚀",
  name: "",
  subtitle: "",
  status: "Not Started",
  weeklyHours: 6,
  localRepoPath: "",
  githubRepo: ""
};

export default function DashboardPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Tasks");
  const [showArchived, setShowArchived] = useState(false);
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(defaultProjectDraft);
  const [projectSettingsDraft, setProjectSettingsDraft] = useState<ProjectDraft>(defaultProjectDraft);

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

  const groupedInsights = useMemo(() => groupInsights(filteredInsights), [filteredInsights]);

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
  const selectedProjectTaskDone = selectedTasks.filter((task) => task.done).length;
  const selectedProjectTaskProgress = selectedTasks.length
    ? Math.round((selectedProjectTaskDone / selectedTasks.length) * 100)
    : selectedProject?.progress ?? 0;
  const selectedProjectRepo = selectedProject?.localRepoPath ? repoByPath.get(selectedProject.localRepoPath) ?? null : null;
  const selectedProjectBudgetShare =
    selectedProject && totalHours ? Math.round((selectedProject.weeklyHours / totalHours) * 100) : 0;
  const visibleInsightCount = groupedInsights.length;

  const allTaskLookup = new Map(
    projects.flatMap((project) =>
      dedupeById(project.tasks).items.map((task) => [
        task.id,
        {
          project,
          task
        }
      ] as const)
    )
  );

  const availableTodayTasks = visibleProjects.flatMap((project) =>
    dedupeById(project.tasks)
      .items.filter((task) => !task.done)
      .map((task) => ({
        id: task.id,
        projectId: project.id,
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
    setCommitFeed([]);
    setLocalCommitFeed([]);
  }, [selectedProject?.id]);

  useEffect(() => {
    setRemoteRepoInput(selectedProject?.remoteRepo ?? selectedProject?.githubRepo ?? "");
    setLocalRepoInput(selectedProject?.localRepoPath ?? "");
  }, [selectedProject?.id, selectedProject?.remoteRepo, selectedProject?.githubRepo, selectedProject?.localRepoPath]);

  useEffect(() => {
    setProjectSettingsDraft(selectedProject ? projectToDraft(selectedProject) : defaultProjectDraft);
  }, [
    selectedProject?.id,
    selectedProject?.name,
    selectedProject?.subtitle,
    selectedProject?.icon,
    selectedProject?.status,
    selectedProject?.weeklyHours,
    selectedProject?.localRepoPath,
    selectedProject?.githubRepo,
    selectedProject?.remoteRepo
  ]);

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
    setProjectDraft(defaultProjectDraft);
    setOpenProjectMenu(null);
    setProjectModalOpen(true);
  };

  const openProjectSettings = (project: Project) => {
    setSelectedId(project.id);
    setProjectSettingsDraft(projectToDraft(project));
    setActiveTab("Project Settings");
    setOpenProjectMenu(null);
  };

  const saveNewProject = async () => {
    if (!projectDraft.name.trim()) {
      push("Project name is required.", "error");
      return;
    }

    const next = { ...state };
    const created = createProjectFromDraft(
      projectDraft,
      projectColors[next.projects.length % projectColors.length] ?? projectColors[0]
    );
    next.projects.unshift(created);

    await save(next);
    setSelectedId(created.id);
    setActiveTab("Tasks");
    setProjectModalOpen(false);
    setProjectDraft(defaultProjectDraft);
    push("Project created.", "success");
  };

  const saveProjectSettings = async () => {
    if (!selectedProject) return;
    if (!projectSettingsDraft.name.trim()) {
      push("Project name is required.", "error");
      return;
    }

    const next = { ...state };
    const project = next.projects.find((item) => item.id === selectedProject.id);
    if (!project) return;

    const previousName = project.name;
    applyProjectDraftToProject(project, projectSettingsDraft);
    next.roadmapCards = normalizeRoadmapProjectRefs(next.roadmapCards, project, [previousName]);

    await save(next);
    setProjectSettingsDraft(projectToDraft(project));
    push("Project updated.", "success");
  };

  const setProjectArchived = async (projectId: string, archived: boolean) => {
    const next = { ...state };
    const project = next.projects.find((item) => item.id === projectId);
    if (!project) return;
    const nextStatus = archived ? "Archived" : "In Progress";
    applyProjectDraftToProject(project, {
      ...projectToDraft(project),
      status: nextStatus
    });
    next.roadmapCards = normalizeRoadmapProjectRefs(next.roadmapCards, project);
    await save(next);
    if (selectedProject?.id === projectId) {
      setProjectSettingsDraft(projectToDraft(project));
    }
    push(archived ? "Project archived." : "Project restored.", "success");
    setOpenProjectMenu(null);
  };

  const deleteProject = async (projectId: string) => {
    const confirmed = window.confirm("Delete this project permanently? This cannot be undone.");
    if (!confirmed) return;
    const next = { ...state };
    const deletedTaskIds = new Set(
      next.projects.find((project) => project.id === projectId)?.tasks.map((task) => task.id) ?? []
    );
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
    next.todayPlanByDate = Object.fromEntries(
      Object.entries(next.todayPlanByDate).map(([date, plan]) => [
        date,
        {
          ...plan,
          taskIds: plan.taskIds.filter((taskId) => !deletedTaskIds.has(taskId))
        }
      ])
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
      dedupeById(project.tasks).items.map((task) => ({
        task,
        projectId: project.id,
        projectName: project.name,
        weeklyHours: project.weeklyHours,
        projectTaskList: project.tasks
      }))
    );
    const roadmapNowProjectIds = new Set<string>();
    const roadmapNowTaskIds = new Set<string>();
    const insightProjectIds = new Set<string>();

    state.roadmapCards
      .filter((card) => card.lane === "now")
      .forEach((card) => {
        const mapped = resolveRoadmapProject(card.project, projects);
        if (mapped && (showArchived || !isArchivedProject(mapped))) {
          roadmapNowProjectIds.add(mapped.id);
        }
        const normalizedTitle = card.title.trim().toLowerCase();
        if (!normalizedTitle) return;
        for (const project of visibleProjects) {
          const match = dedupeById(project.tasks).items.find((task) => task.text.trim().toLowerCase() === normalizedTitle);
          if (match) {
            roadmapNowTaskIds.add(match.id);
          }
        }
      });

    activeInsights
      .filter((insight) => insight.projectId)
      .forEach((insight) => {
        const project = projects.find((item) => item.id === insight.projectId);
        if (project && (showArchived || !isArchivedProject(project))) {
          insightProjectIds.add(project.id);
        }
      });

    return computeTodayPlan(taskList, {
      boostProjectIds: Array.from(new Set([...roadmapNowProjectIds, ...insightProjectIds])),
      roadmapNowProjectIds: Array.from(roadmapNowProjectIds),
      roadmapNowTaskIds: Array.from(roadmapNowTaskIds),
      insightProjectIds: Array.from(insightProjectIds),
      maxTasks: 5
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
    setTodayPlanDraft((prev) => {
      if (prev.includes(taskId) || prev.length >= 7) return prev;
      return [...prev, taskId];
    });
    setTodayTaskQuery("");
  };

  const startFocus = async (taskId: string) => {
    const entry = allTaskLookup.get(taskId);
    if (!entry) {
      push("Task no longer exists.", "warning");
      return;
    }

    const next = { ...state };
    next.focusSessions.unshift({
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      durationMinutes: 45,
      completedAt: null,
      planned: false,
      projectId: entry.project.id,
      reason: entry.task.text
    });
    await save(next);
    push(`Focus started for ${entry.project.name}. Timer UI is still stubbed.`, "success");
  };

  const saveTodayPlan = async () => {
    const dedupedTaskIds = Array.from(new Set(todayPlanDraft)).filter((taskId) => allTaskLookup.has(taskId)).slice(0, 7);
    setTodayPlanDraft(dedupedTaskIds);
    await persistTodayPlan(dedupedTaskIds, "manual");
  };

  const applyInsightActionLocally = async (group: InsightGroup, action: SuggestedAction) => {
    const next = { ...state };

    if (action.type === "CREATE_TASK") {
      const targetProjectId = action.payload.projectId ?? group.projectId ?? selectedProject?.id ?? null;
      if (!targetProjectId) {
        return false;
      }
      const project = next.projects.find((candidate) => candidate.id === targetProjectId);
      if (!project) {
        return false;
      }
      project.tasks.unshift({
        id: crypto.randomUUID(),
        text: String(action.payload.title ?? `Follow up: ${group.title}`),
        done: false,
        status: "todo",
        dependsOnIds: [],
        priority: "med",
        dueDate: null,
        milestone: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        linkedCommit: null
      });
      await save(next);
      return true;
    }

    if (action.type === "SCHEDULE_FOCUS") {
      next.focusSessions.unshift({
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        durationMinutes: Math.max(15, Number(action.payload.minutes ?? 45)),
        completedAt: null,
        planned: true,
        projectId: action.payload.projectId ?? group.projectId ?? null,
        reason: String(action.payload.reason ?? group.title)
      });
      await save(next);
      return true;
    }

    if (action.type === "MOVE_ROADMAP_NOW" || action.type === "MOVE_ROADMAP_CARD") {
      const projectId = action.payload.projectId ?? group.projectId ?? selectedProject?.id ?? null;
      const project = projectId ? next.projects.find((candidate) => candidate.id === projectId) : null;
      const lane = action.type === "MOVE_ROADMAP_CARD" ? String(action.payload.lane ?? "now") : "now";
      const card =
        next.roadmapCards.find((item) => item.id === action.payload.cardId) ??
        next.roadmapCards.find(
          (item) => item.lane !== lane && (!project || isRoadmapCardForProject(item, project, next.projects))
        );
      if (!card) {
        return false;
      }
      card.lane = lane as RoadmapLane;
      card.updatedAt = new Date().toISOString();
      await save(next);
      return true;
    }

    if (action.type === "CREATE_JOURNAL") {
      const nowIso = new Date().toISOString();
      next.journalEntries.unshift({
        id: crypto.randomUUID(),
        projectId: action.payload.projectId ?? group.projectId ?? null,
        ts: nowIso,
        type: action.payload.entryType ?? "note",
        title: action.payload.title ?? group.title,
        body: action.payload.body ?? group.reason,
        links: {
          taskIds: [],
          roadmapCardIds: [],
          repoIds: group.repoId ? [group.repoId] : [],
          commitShas: []
        },
        tags: ["insight"],
        createdAt: nowIso,
        updatedAt: nowIso
      });
      await save(next);
      return true;
    }

    if (action.type === "COPY_REPO_PATH") {
      const path = action.payload.repoPath ?? resolveRepoPath(group, selectedProject, repoById, repoByPath);
      if (!path) {
        return false;
      }
      if (!navigator.clipboard?.writeText) {
        return false;
      }
      await navigator.clipboard.writeText(path);
      return true;
    }

    if (action.type === "OPEN_REPO") {
      return false;
    }

    if (action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W") {
      const days = action.type === "SNOOZE_1D" ? 1 : 7;
      const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      next.insights = next.insights.map((insight) =>
        group.items.find((item) => item.id === insight.id)
          ? { ...insight, dismissedUntil: until, updatedAt: new Date().toISOString() }
          : insight
      );
      await save(next);
      return true;
    }

    return false;
  };

  const runInsightAction = async (group: InsightGroup, action: SuggestedAction) => {
    if (action.type === "COPY_REPO_PATH" || action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W") {
      try {
        const applied = await applyInsightActionLocally(group, action);
        if (!applied) {
          push(
            action.type === "COPY_REPO_PATH" ? "No repo path available for this insight." : "Could not update this insight.",
            "warning"
          );
          return;
        }
        push(successMessageForInsightAction(action.type), "success");
      } catch (err) {
        push(err instanceof Error ? err.message : "Insight action failed.", "warning");
      }
      return;
    }

    try {
      await api.insightAction(action);
      await refresh();
      push(successMessageForInsightAction(action.type), "success");
    } catch {
      const applied = await applyInsightActionLocally(group, action);
      if (applied) {
        push(`${successMessageForInsightAction(action.type)} API unavailable, applied locally.`, "warning");
        return;
      }
      push(`Action unavailable in this build: ${action.label}.`, "warning");
    }
  };

  return (
    <div className="grid gap-6 xl:gap-7">
      <GlassPanel variant="hero">
        <SectionHeader
          eyebrow="Today"
          title="Daily Goals"
          subtitle={dateLabel}
          size="hero"
          rightControls={
            <div className="flex items-center gap-2">
              <Pill>Score {todayEntry?.score ?? 0}%</Pill>
              <Pill tone="success">
                {todayEntry?.completedPoints ?? 0}/{todayEntry?.goals.length ?? 0}
              </Pill>
            </div>
          }
        />
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(todayEntry?.goals ?? []).slice(0, 5).map((goal) => (
            <label key={goal.id} className="rounded-[20px] border border-white/10 bg-white/[0.055] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{goal.category}</div>
                  <div className="mt-2 text-base font-medium">{goal.title}</div>
                </div>
                <input
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                  type="checkbox"
                  checked={goal.done}
                  readOnly
                  aria-label={`Goal ${goal.title} status`}
                />
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/55">
                <span>{goal.points} point{goal.points === 1 ? "" : "s"}</span>
                <span>{goal.done ? "Completed" : "In play"}</span>
              </div>
            </label>
          ))}
          {(todayEntry?.goals.length ?? 0) === 0 && (
            <p className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-6 text-sm text-white/60 md:col-span-2 xl:col-span-3">
              No goals yet for today.
            </p>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
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
        <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {visibleProjects.map((project) => {
            const tasksDone = project.tasks.filter((task) => task.done).length;
            const tasksTotal = project.tasks.length;
            const progress = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : project.progress;
            const repo = project.localRepoPath ? repoByPath.get(project.localRepoPath) : null;
            const dirty = repo?.dirty ?? false;
            const active = repo?.todayCommitCount ?? 0;
            const isSelected = selectedProject?.id === project.id;

            return (
              <GlassPanel
                key={project.id}
                as="button"
                type="button"
                variant="quiet"
                className={`hover-lift relative min-h-[220px] text-left ${isSelected ? "accent-glow border-white/16" : ""}`}
                onClick={() => {
                  setSelectedId(project.id);
                  setActiveTab("Tasks");
                }}
                aria-label={`Select project ${project.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl">{project.icon}</div>
                    <h4 className="mt-3 text-lg font-semibold tracking-[-0.03em]">{project.name}</h4>
                    <p className="mt-1 text-sm text-white/55">{project.subtitle || "No subtitle"}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <ProgressRing value={progress} />
                    <div className="relative">
                      <button
                        className="button-secondary h-8 w-8 rounded-xl px-0 py-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenProjectMenu((prev) => (prev === project.id ? null : project.id));
                        }}
                        aria-label={`Open ${project.name} menu`}
                        type="button"
                      >
                        ...
                      </button>
                      {openProjectMenu === project.id && (
                        <div className="absolute right-0 z-20 mt-2 min-w-[190px] rounded-[18px] border border-white/10 bg-[#0a0d14] p-2 shadow-2xl">
                          <button
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                            onClick={(event) => {
                              event.stopPropagation();
                              openProjectSettings(project);
                            }}
                            type="button"
                          >
                            Project settings
                          </button>
                          <button
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                            onClick={(event) => {
                              event.stopPropagation();
                              void setProjectArchived(project.id, !isArchivedProject(project));
                            }}
                            type="button"
                          >
                            {isArchivedProject(project) ? "Restore" : "Archive"}
                          </button>
                          <button
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/20"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteProject(project.id);
                            }}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <Pill tone={isSelected ? "accent" : isArchivedProject(project) ? "warning" : "neutral"}>
                    {project.status}
                  </Pill>
                  <span className="text-xs text-white/60">{project.weeklyHours}h/week</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-white/62">
                  <div className="flex items-center justify-between">
                    <span>Tasks</span>
                    <span>{tasksDone}/{tasksTotal}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Local git</span>
                    <span>{active} commits today</span>
                  </div>
                </div>
                {dirty && <Pill tone="warning" className="mt-4">Dirty tree</Pill>}
                <div
                  className="absolute inset-x-0 bottom-0 h-1 rounded-b-xl"
                  style={{ background: project.color, opacity: isSelected ? 0.6 : 0.25 }}
                />
              </GlassPanel>
            );
          })}

          <GlassPanel
            as="button"
            type="button"
            variant="quiet"
            className="hover-lift min-h-[220px] border-dashed border-white/20 text-center"
            onClick={openCreateProjectModal}
            aria-label="Add project"
          >
            <div className="text-2xl">+</div>
            <div className="mt-3 text-sm font-medium">Add Project</div>
            <p className="mt-1 text-xs text-white/50">Create a new workstream</p>
          </GlassPanel>
        </section>
      </GlassPanel>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
        <GlassPanel variant="hero" className="accent-glow">
          {selectedProject ? (
            <div className="grid gap-5">
              <SectionHeader
                eyebrow="Selected Project"
                title={`${selectedProject.icon} ${selectedProject.name}`}
                subtitle={selectedProject.subtitle || "No subtitle"}
                size="hero"
                titleClassName="max-w-[16ch]"
                rightControls={<Pill tone="accent">{selectedProject.status}</Pill>}
              />

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-white/[0.055] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Completion</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedProjectTaskProgress}%</div>
                  <div className="mt-1 text-sm text-white/58">
                    {selectedProjectTaskDone}/{selectedTasks.length} tasks closed
                  </div>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.055] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Weekly Budget</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedProject.weeklyHours}h</div>
                  <div className="mt-1 text-sm text-white/58">{selectedProjectBudgetShare}% of active capacity</div>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.055] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Live Signals</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedProjectInsights.length}</div>
                  <div className="mt-1 text-sm text-white/58">
                    {selectedProjectRepo?.dirty ? "Dirty tree needs cleanup" : selectedProjectRepo ? "Repo linked locally" : "No local repo linked"}
                  </div>
                </div>
              </div>

              {selectedProjectInsights.length > 0 && (
                <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">Latest signals</div>
                    <span className="text-xs text-white/55">Grouped items appear below in Insights</span>
                  </div>
                  <div className="mt-3 grid gap-2">
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
                <ProjectJournalPanel
                  project={selectedProject}
                  tasks={selectedTasks}
                  roadmapCards={filteredRoadmap}
                  journalEntries={state.journalEntries}
                  repo={selectedProjectRepo}
                  commitOptions={[
                    ...localCommitFeed.map((commit) => ({
                      sha: commit.sha,
                      shortSha: commit.shortSha,
                      message: commit.message
                    })),
                    ...commitFeed.map((commit) => ({
                      sha: commit.sha,
                      shortSha: commit.shortSha,
                      message: commit.message
                    }))
                  ]}
                />
              )}

              {activeTab === "Project Settings" && (
                <div className="grid gap-4">
                  <ProjectEditorFields
                    draft={projectSettingsDraft}
                    setDraft={setProjectSettingsDraft}
                    repos={uniqueRepos}
                    githubRepoOptions={githubRepoOptions}
                    githubRepoListId="project-settings-github-list"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className="button-primary" onClick={saveProjectSettings} aria-label="Save project settings">
                      Save Changes
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() => setProjectSettingsDraft(projectToDraft(selectedProject))}
                      aria-label="Reset project settings"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
            title="Weekly Budget"
            subtitle={`${totalHours}h / week`}
            rightControls={<Pill>{tasksProgress}% completion</Pill>}
          />
          <div className="mt-4">
            <StackedBar segments={visibleProjects.map((project) => ({ color: project.color, value: project.weeklyHours }))} />
          </div>
          <div className="mt-5 grid gap-3">
            {visibleProjects.map((project) => (
              <div key={project.id} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
                    <span>{project.name}</span>
                  </div>
                  <span className="text-xs text-white/55">
                    {totalHours ? Math.round((project.weeklyHours / totalHours) * 100) : 0}% share
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-white/55">{project.tasks.filter((task) => !task.done).length} open tasks</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 w-8 rounded-xl border border-white/10 bg-white/10"
                      onClick={() => adjustHours(project.id, -1)}
                      aria-label={`Decrease ${project.name} weekly hours`}
                    >
                      -
                    </button>
                    <span className="w-14 text-center text-white/60">{project.weeklyHours}h</span>
                    <button
                      className="h-8 w-8 rounded-xl border border-white/10 bg-white/10"
                      onClick={() => adjustHours(project.id, 1)}
                      aria-label={`Increase ${project.name} weekly hours`}
                    >
                      +
                    </button>
                  </div>
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
          subtitle={`${visibleInsightCount} grouped signals, sorted by severity`}
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

        <div className="mt-5 grid gap-3">
          {groupedInsights.length === 0 && (
            <p className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-6 text-sm text-white/60">
              {insightFilter === "priority" ? "No critical or warning insights right now." : "No insights match this filter."}
            </p>
          )}
          {groupedInsights.map((group) => {
            const project = group.projectId ? projects.find((item) => item.id === group.projectId) : null;
            const repo = group.repoId ? repoById.get(group.repoId) : null;
            return (
              <GlassPanel key={group.key} variant="quiet">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold tracking-[-0.03em]">
                        {group.title} {group.items.length > 1 ? `x${group.items.length}` : ""}
                      </div>
                      {project && <Pill>{project.name}</Pill>}
                      {repo && <Pill>{repo.name}</Pill>}
                    </div>
                    <p className="mt-2 text-sm text-white/66">{group.reason}</p>
                  </div>
                  <Pill tone={group.severity === "crit" ? "danger" : group.severity === "warn" ? "warning" : "neutral"}>
                    {group.severity}
                  </Pill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {group.actions.map((action) => (
                    <button
                      key={action.id}
                      className="button-secondary"
                      onClick={() => runInsightAction(group, action)}
                    >
                      {shortLabelForInsightAction(action)}
                    </button>
                  ))}
                </div>
                <details className="mt-4 rounded-[18px] border border-white/10 bg-black/20 p-3">
                  <summary className="cursor-pointer text-xs uppercase tracking-[0.2em] text-white/50">Why?</summary>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {formatInsightMetrics(group.items).map(([key, value]) => (
                      <div key={`${group.key}-${key}`} className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">{key}</div>
                        <div className="mt-1 text-sm text-white/72">{value}</div>
                      </div>
                    ))}
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
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Active Today</div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">
              {uniqueRepos.filter((repo) => repo.todayCommitCount > 0).length}
            </div>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Dirty Trees</div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">{uniqueRepos.filter((repo) => repo.dirty).length}</div>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Scan Errors</div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">{scanErrorCount}</div>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Linked to Projects</div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">
              {projects.filter((project) => project.localRepoPath).length}
            </div>
          </div>
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

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-2">
            {todayPlanDraft.length === 0 && (
              <p className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-6 text-sm text-white/60">
                No tasks selected yet.
              </p>
            )}
            {todayPlanDraft.map((taskId, index) => {
              const entry = allTaskLookup.get(taskId);
              const project = entry?.project;
              const task = entry?.task;
              if (!task || !project) return null;
              return (
                <div key={taskId} className="table-row">
                  <div>
                    <div className="text-sm font-medium">{task.text}</div>
                    <div className="text-xs text-white/50">
                      {project.name}
                      {isArchivedProject(project) ? " • Archived project" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={task.priority === "high" ? "danger" : task.priority === "med" ? "warning" : "neutral"}>
                      {task.priority}
                    </Pill>
                    {index === 0 && (
                      <button className="button-secondary" onClick={() => startFocus(taskId)} aria-label="Start focus on top task">
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

          <div className="grid gap-4">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <label className="text-xs text-white/60">Add from tasks ({todayPlanDraft.length}/7)</label>
              <input
                className="input mt-2"
                value={todayTaskQuery}
                onChange={(event) => setTodayTaskQuery(event.target.value)}
                placeholder="Search tasks to add..."
                aria-label="Search tasks for today plan"
              />
              <div className="mt-3 grid max-h-56 gap-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
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

            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <label className="text-xs text-white/60">Notes</label>
              <input
                className="input mt-2"
                placeholder="Notes for today..."
                value={todayPlanNotes}
                onChange={(event) => setTodayPlanNotes(event.target.value)}
                aria-label="Today plan notes"
              />
              <button className="button-primary mt-3" onClick={saveTodayPlan} aria-label="Save today plan">
                Save Plan
              </button>
            </div>
          </div>
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
        title="Create Project"
        footer={
          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={() => setProjectModalOpen(false)} aria-label="Cancel project modal">
              Cancel
            </button>
            <button className="button-primary" onClick={saveNewProject} aria-label="Create project">
              Create
            </button>
          </div>
        }
      >
        <ProjectEditorFields
          draft={projectDraft}
          setDraft={setProjectDraft}
          repos={uniqueRepos}
          githubRepoOptions={githubRepoOptions}
          githubRepoListId="project-create-github-list"
        />
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

function successMessageForInsightAction(type: SuggestedAction["type"]) {
  switch (type) {
    case "CREATE_TASK":
      return "Task created.";
    case "SCHEDULE_FOCUS":
      return "Focus session scheduled.";
    case "MOVE_ROADMAP_NOW":
    case "MOVE_ROADMAP_CARD":
      return "Roadmap card updated.";
    case "COPY_REPO_PATH":
      return "Repo path copied.";
    case "OPEN_REPO":
      return "Open repo requested.";
    case "SNOOZE_1D":
      return "Insight snoozed for 1 day.";
    case "SNOOZE_1W":
      return "Insight snoozed for 1 week.";
    case "CREATE_JOURNAL":
      return "Journal entry added.";
    case "DISMISS":
      return "Insight dismissed.";
    default:
      return "Insight action applied.";
  }
}

function shortLabelForInsightAction(action: SuggestedAction) {
  switch (action.type) {
    case "MOVE_ROADMAP_NOW":
      return "Move to Now";
    case "MOVE_ROADMAP_CARD":
      return "Move Card";
    case "COPY_REPO_PATH":
      return "Copy Path";
    case "SNOOZE_1D":
      return "Snooze 1d";
    case "SNOOZE_1W":
      return "Snooze 1w";
    default:
      return action.label;
  }
}

function formatInsightMetrics(items: Insight[]) {
  const metrics = items.flatMap((item) => Object.entries(item.metrics ?? {}));
  if (!metrics.length) {
    return [["Reason", items[0]?.reason ?? "No additional metrics"]];
  }

  const grouped = new Map<string, string[]>();
  for (const [key, rawValue] of metrics) {
    const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
    const display =
      typeof rawValue === "number"
        ? Number.isInteger(rawValue)
          ? `${rawValue}`
          : rawValue.toFixed(1)
        : Array.isArray(rawValue)
        ? rawValue.join(", ")
        : typeof rawValue === "object" && rawValue !== null
        ? JSON.stringify(rawValue)
        : String(rawValue);
    const list = grouped.get(label) ?? [];
    if (!list.includes(display)) {
      list.push(display);
      grouped.set(label, list);
    }
  }

  return Array.from(grouped.entries()).map(([label, values]) => [label, values.join(" · ")]);
}

function defaultInsightActions(insight: Insight): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  actions.push({
    id: `${insight.id}-task`,
    type: "CREATE_TASK",
    label: "Create Task",
    payload: {
      projectId: insight.projectId ?? null,
      title: `Follow up: ${insight.title}`
    }
  });
  actions.push({
    id: `${insight.id}-focus`,
    type: "SCHEDULE_FOCUS",
    label: "Schedule Focus",
    payload: {
      projectId: insight.projectId ?? null,
      reason: insight.title,
      minutes: 45
    }
  });
  if (insight.projectId) {
    actions.push({
      id: `${insight.id}-roadmap`,
      type: "MOVE_ROADMAP_NOW",
      label: "Move Roadmap Card to Now",
      payload: {
        projectId: insight.projectId
      }
    });
  }
  actions.push({
    id: `${insight.id}-copy`,
    type: "COPY_REPO_PATH",
    label: "Copy Repo Path",
    payload: { repoId: insight.repoId ?? null, projectId: insight.projectId ?? null }
  });
  actions.push({
    id: `${insight.id}-snooze-1d`,
    type: "SNOOZE_1D",
    label: "Snooze 1 day",
    payload: { insightId: insight.id }
  });
  actions.push({
    id: `${insight.id}-snooze-1w`,
    type: "SNOOZE_1W",
    label: "Snooze 1 week",
    payload: { insightId: insight.id }
  });
  return actions;
}

function groupInsights(list: Insight[]): InsightGroup[] {
  const map = new Map<string, InsightGroup>();
  for (const insight of list) {
    const key = `${insight.ruleId}:${insight.projectId ?? "none"}:${insight.repoId ?? "none"}`;
    const existing = map.get(key);
    const suggestedActions = dedupeInsightActions(
      insight.suggestedActions.length ? insight.suggestedActions : defaultInsightActions(insight),
      insight
    );
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
        actions: [...suggestedActions]
      });
    } else {
      existing.items.push(insight);
      existing.actions = dedupeInsightActions([...existing.actions, ...suggestedActions], insight);
      if (severityRank(insight.severity) > severityRank(existing.severity)) {
        existing.severity = insight.severity;
      }
      if (!existing.projectId && insight.projectId) existing.projectId = insight.projectId;
      if (!existing.repoId && insight.repoId) existing.repoId = insight.repoId;
    }
  }
  return Array.from(map.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function dedupeInsightActions(actions: SuggestedAction[], insight: Insight) {
  const map = new Map<string, SuggestedAction>();
  for (const action of actions) {
    const payload =
      action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W"
        ? { ...action.payload, insightId: action.payload.insightId ?? insight.id }
        : action.payload;
    const normalized = { ...action, payload };
    const key = `${normalized.type}:${JSON.stringify(normalized.payload ?? {})}`;
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  }
  return Array.from(map.values()).sort((a, b) => insightActionPriority(a.type) - insightActionPriority(b.type));
}

function insightActionPriority(type: SuggestedAction["type"]) {
  switch (type) {
    case "CREATE_TASK":
      return 0;
    case "SCHEDULE_FOCUS":
      return 1;
    case "MOVE_ROADMAP_NOW":
      return 2;
    case "MOVE_ROADMAP_CARD":
      return 3;
    case "OPEN_REPO":
      return 4;
    case "COPY_REPO_PATH":
      return 5;
    case "CREATE_JOURNAL":
      return 6;
    case "SNOOZE_1D":
      return 7;
    case "SNOOZE_1W":
      return 8;
    default:
      return 9;
  }
}

function ProjectEditorFields({
  draft,
  setDraft,
  repos,
  githubRepoOptions,
  githubRepoListId
}: {
  draft: ProjectDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProjectDraft>>;
  repos: LocalRepo[];
  githubRepoOptions: string[];
  githubRepoListId: string;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <label className="mb-1 block text-xs text-white/60">Emoji</label>
        <EmojiPicker value={draft.emoji} onChange={(emoji) => setDraft((prev) => ({ ...prev, emoji }))} />
      </div>
      <label className="grid gap-1">
        <span className="text-xs text-white/60">Name</span>
        <input
          className="input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Project name"
          aria-label="Project name"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-white/60">Subtitle</span>
        <input
          className="input"
          value={draft.subtitle}
          onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
          placeholder="Optional subtitle"
          aria-label="Project subtitle"
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-white/60">Status</span>
          <select
            className="input"
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as UiProjectStatus }))}
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
              type="button"
              className="button-secondary px-0"
              onClick={() =>
                setDraft((prev) => ({ ...prev, weeklyHours: clampWeeklyHours(prev.weeklyHours - 1) }))
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
              value={draft.weeklyHours}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  weeklyHours: clampWeeklyHours(Number(event.target.value) || 0)
                }))
              }
              aria-label="Weekly hours"
            />
            <button
              type="button"
              className="button-secondary px-0"
              onClick={() =>
                setDraft((prev) => ({ ...prev, weeklyHours: clampWeeklyHours(prev.weeklyHours + 1) }))
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
            value={draft.localRepoPath}
            onChange={(event) => setDraft((prev) => ({ ...prev, localRepoPath: event.target.value }))}
            aria-label="Local repository"
          >
            <option value="">Not linked</option>
            {repos.map((repo) => (
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
            value={draft.githubRepo}
            list={githubRepoListId}
            onChange={(event) => setDraft((prev) => ({ ...prev, githubRepo: event.target.value }))}
            placeholder="owner/repo"
            aria-label="GitHub repository"
          />
          <datalist id={githubRepoListId}>
            {githubRepoOptions.map((repo) => (
              <option key={repo} value={repo} />
            ))}
          </datalist>
        </label>
      </div>
    </div>
  );
}

function clampWeeklyHours(value: number) {
  return Math.max(0, Math.min(40, value));
}

function projectToDraft(project: Project): ProjectDraft {
  return {
    emoji: project.icon,
    name: project.name,
    subtitle: project.subtitle,
    status: project.status,
    weeklyHours: project.weeklyHours,
    localRepoPath: project.localRepoPath ?? "",
    githubRepo: project.githubRepo ?? project.remoteRepo ?? ""
  };
}

function createProjectFromDraft(draft: ProjectDraft, color: string): Project {
  const nowIso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    subtitle: draft.subtitle.trim(),
    icon: draft.emoji,
    color,
    status: draft.status,
    progress: 0,
    weeklyHours: clampWeeklyHours(Number(draft.weeklyHours) || 0),
    githubRepo: draft.githubRepo.trim() || null,
    remoteRepo: draft.githubRepo.trim() || null,
    localRepoPath: draft.localRepoPath || null,
    healthScore: null,
    archivedAt: draft.status === "Archived" ? nowIso : null,
    createdAt: nowIso,
    updatedAt: nowIso,
    tasks: []
  };
}

function applyProjectDraftToProject(project: Project, draft: ProjectDraft) {
  const nowIso = new Date().toISOString();
  project.name = draft.name.trim();
  project.subtitle = draft.subtitle.trim();
  project.icon = draft.emoji;
  project.status = draft.status;
  project.weeklyHours = clampWeeklyHours(Number(draft.weeklyHours) || 0);
  project.githubRepo = draft.githubRepo.trim() || null;
  project.remoteRepo = draft.githubRepo.trim() || null;
  project.localRepoPath = draft.localRepoPath || null;
  project.archivedAt = draft.status === "Archived" ? project.archivedAt ?? nowIso : null;
  project.updatedAt = nowIso;
}

function normalizeRoadmapProjectRefs(cards: RoadmapCard[], project: Project, aliases: string[] = []) {
  const refs = new Set([project.id, project.name, ...aliases]);
  return cards.map((card) => {
    if (!card.project) return card;
    if (refs.has(card.project)) {
      return {
        ...card,
        project: project.id,
        updatedAt: new Date().toISOString()
      };
    }
    return card;
  });
}

function isArchivedProject(project: Project) {
  return project.status === "Archived";
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
