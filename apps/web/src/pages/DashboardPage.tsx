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
import Select from "../components/Select";
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

export default function DashboardPage({ projectId }: { projectId?: string | null }) {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [selectedIndex, setSelectedIndex] = useState(0);
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

  // Force selection lock if projectId is passed via route hash
  const forcedIndex = projectId ? visibleProjects.findIndex(p => p.id === projectId) : -1;
  const activeIndex = forcedIndex >= 0 ? forcedIndex : selectedIndex;

  const selectedProject =
    visibleProjects.length > 0 && activeIndex < visibleProjects.length ? visibleProjects[activeIndex] : null;

  // Narrow all view variables if projectId is provided (isolate to one project)
  const dashboardProjects = projectId && selectedProject ? [selectedProject] : visibleProjects;
  const dashboardTasks = projectId && selectedProject ? selectedProject.tasks : projects.flatMap((p) => p.tasks);

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
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        {/* TOP ROW */}
        <GlassPanel variant="standard" className="flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-muted px-2 pb-2">Capacity / Budget</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold tracking-tight">{totalHours} <span className="text-xl text-muted">hrs</span></div>
            <div className="text-sm font-medium text-blue-400/80 uppercase tracking-widest">{selectedProjectBudgetShare}% Active</div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-muted px-2 pb-2">Daily Goals</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold tracking-tight">{todayEntry?.score ?? 0}%</div>
            <div className="text-sm font-medium text-emerald-400">
              {todayEntry?.completedPoints ?? 0}/{todayEntry?.goals.length ?? 0} pts
            </div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-muted px-2 pb-2">Actions</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold tracking-tight">{visibleInsightCount}</div>
            <div className="text-sm font-medium text-amber-400">Pending</div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border-emerald-500/20 flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/70 px-2 pb-2">Activity</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold text-emerald-100 tracking-tight">Ready</div>
            <button className="button-primary bg-emerald-600 border-none text-strong text-xs px-4 py-1">Focus</button>
          </div>
        </GlassPanel>

        {/* MIDDLE ROW */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <GlassPanel variant="hero" className="flex-1">
            <SectionHeader
              title="Projects"
              subtitle={showArchived ? "All projects" : "Active projects"}
              rightControls={
                <button className="button-secondary" onClick={openCreateProjectModal}>+ New</button>
              }
            />
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleProjects.slice(0, 4).map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const tasksDone = project.tasks.filter((task) => task.done).length;
                const tasksTotal = project.tasks.length;
                return (
                  <button
                    key={project.id}
                    className={`text-left p-4 rounded-xl border transition ${isSelected ? 'bg-muted border-strong shadow-lg' : 'bg-subtle border-subtle hover:bg-muted'}`}
                    onClick={() => { setSelectedId(project.id); setActiveTab("Tasks"); }}
                  >
                    <div className="flex justify-between">
                      <span className="text-2xl">{project.icon}</span>
                      <span className="text-xs text-muted px-2 py-1 rounded bg-subtle border border-muted">{project.weeklyHours}h</span>
                    </div>
                    <div className="mt-3 font-semibold truncate text-[15px]">{project.name}</div>
                    <div className="mt-1 flex justify-between items-center text-xs text-muted">
                      <span className="truncate">{project.status}</span>
                      <span>{tasksDone}/{tasksTotal} done</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassPanel>
        </div>

        <GlassPanel variant="standard" className="flex flex-col items-center justify-center text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-muted mb-7">Task Progress</div>
          <div className="relative w-36 h-36 flex items-center justify-center group mb-5">
            <div className="absolute inset-0 rounded-full border-[10px] border-subtle"></div>
            <div
              className="absolute inset-0 rounded-full border-[10px] border-accent"
              style={{
                clipPath: 'polygon(50% 0%, 100% 0, 100% 100%, 0% 100%, 0% 0%, 50% 0%)',
                transform: `rotate(${(tasksProgress / 100) * 360}deg)`
              }}
            ></div>
            <div className="text-4xl font-semibold tracking-tight">{tasksProgress}%</div>
          </div>
          <div className="text-sm tracking-wide text-muted">{completedTasks} of {totalTasks} global tasks</div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-5xl mb-5 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
            {selectedProject?.icon ?? "👤"}
          </div>
          <h3 className="font-semibold text-lg tracking-tight">{selectedProject?.name ?? "No Selection"}</h3>
          <p className="text-sm text-muted mt-1">{selectedProject?.subtitle ?? "Select a project to view details"}</p>
          <div className="flex gap-6 mt-6 pt-6 border-t border-subtle w-full justify-center text-sm">
            <div><strong className="block text-2xl font-semibold mb-1">{selectedProject?.tasks.length ?? 0}</strong> <span className="text-muted uppercase tracking-widest text-[10px]">Tasks</span></div>
            <div><strong className="block text-2xl font-semibold mb-1">{selectedProjectTaskProgress}%</strong> <span className="text-muted uppercase tracking-widest text-[10px]">Done</span></div>
          </div>
          {selectedProject && (
            <button className="text-xs text-accent mt-4 hover:underline" onClick={() => setActiveTab("Project Settings")}>Edit Settings</button>
          )}
        </GlassPanel>

        {/* BOTTOM ROW */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <GlassPanel variant="standard" className="flex-1 flex flex-col min-h-[300px]">
            <SectionHeader title="Tasks" subtitle={selectedProject?.name ?? "Global"} />
            <div className="mt-4 flex-1 grid gap-2 overflow-y-auto pr-2">
              {selectedTasks.length === 0 && <p className="text-sm text-muted">No tasks.</p>}
              {selectedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  text={task.text}
                  done={task.done}
                  onToggle={(nextValue) => toggleTask(task.id, nextValue)}
                />
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <input
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="New task..."
                className="input flex-1"
              />
              <button onClick={addTask} className="button-secondary">Add</button>
            </div>
          </GlassPanel>
        </div>

        <GlassPanel variant="standard" className="flex flex-col h-[300px]">
          <SectionHeader title="Signals & Insights" />
          <div className="mt-4 flex-1 grid gap-3 overflow-y-auto pr-2">
            {groupedInsights.length === 0 && <p className="text-sm text-muted">No insights to review.</p>}
            {groupedInsights.map(group => (
              <div key={group.key} className="p-3 bg-subtle rounded-xl border border-subtle">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-medium text-sm leading-tight text-strong">{group.title}</div>
                  <Pill tone={group.severity === 'crit' ? 'danger' : group.severity === 'warn' ? 'warning' : 'neutral'}>
                    {group.severity}
                  </Pill>
                </div>
                <div className="text-xs text-muted mt-2 line-clamp-2 leading-relaxed">{group.reason}</div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col h-[300px]">
          <SectionHeader title="Local Git" subtitle={selectedProjectRepo?.name} />
          <div className="mt-4 flex-1 flex flex-col pt-4 items-center text-center">
            <div className="text-5xl mb-4 text-subtle">⎇</div>
            <div className="font-medium mb-1 text-lg">{selectedProject?.localRepoPath ? `${selectedProjectRepo?.todayCommitCount ?? 0} Commits Today` : "Not Linked"}</div>
            <p className="text-xs text-muted mb-6">{selectedProject?.localRepoPath ? "Tree is clean" : "Update settings to link local path."}</p>
            {!selectedProject?.localRepoPath && (
              <button className="button-secondary" onClick={() => setActiveTab("Project Settings")}>Link Repo</button>
            )}
          </div>
        </GlassPanel>
      </div>

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

      {activeTab === "Project Settings" && selectedProject && (
        <Modal
          open
          onClose={() => setActiveTab("Tasks")}
          title="Project Settings"
          footer={
            <div className="flex justify-end gap-3">
              <button className="button-secondary text-red-500 hover:bg-red-500/10 mr-auto border-red-500/20" onClick={() => deleteProject(selectedProject.id)}>Delete</button>
              <button className="button-secondary" onClick={() => setProjectArchived(selectedProject.id, !isArchivedProject(selectedProject))}>
                {isArchivedProject(selectedProject) ? "Restore" : "Archive"}
              </button>
              <button className="button-primary" onClick={() => { saveProjectSettings(); setActiveTab("Tasks"); }}>Save</button>
            </div>
          }
        >
          <ProjectEditorFields
            draft={projectSettingsDraft}
            setDraft={setProjectSettingsDraft}
            repos={uniqueRepos}
            githubRepoOptions={githubRepoOptions}
            githubRepoListId="project-settings-github-list"
          />
        </Modal>
      )}
    </>
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
        <label className="mb-1 block text-xs text-muted">Emoji</label>
        <EmojiPicker value={draft.emoji} onChange={(emoji) => setDraft((prev) => ({ ...prev, emoji }))} />
      </div>
      <label className="grid gap-1">
        <span className="text-xs text-muted">Name</span>
        <input
          className="input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Project name"
          aria-label="Project name"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-muted">Subtitle</span>
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
          <span className="text-xs text-muted">Status</span>
          <Select
            className="w-full"
            value={draft.status}
            onChange={(val) => setDraft((prev) => ({ ...prev, status: val as UiProjectStatus }))}
            options={uiStatuses.map((status) => ({ value: status, label: status }))}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Weekly Hours</span>
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
          <span className="text-xs text-muted">Local Repo</span>
          <Select
            className="w-full"
            value={draft.localRepoPath || ""}
            onChange={(val) => setDraft((prev) => ({ ...prev, localRepoPath: val }))}
            options={[
              { value: "", label: "Not linked" },
              ...repos.map((repo) => ({ value: repo.path, label: `${repo.name} - ${repo.path}` }))
            ]}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">GitHub Repo</span>
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
