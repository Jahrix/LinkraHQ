import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  type AppState,
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
import TodayMissionHero from "../components/TodayMissionHero";
import TodayPlanQueue from "../components/TodayPlanQueue";
import ProjectCard from "../components/ProjectCard";
import ProjectModal, { type ProjectDraft } from "../components/ProjectModal";
import SignalActionPanel from "../components/SignalActionPanel";
import { api } from "../lib/api";
import { cloneAppState } from "../lib/appStateModel";
import { resolveProjectSelection } from "../lib/dashboardSelection";
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

const projectColors = ["#5DD8FF", "#78E3A4", "#F9A8D4", "#F59E0B", "#60A5FA", "#A78BFA", "#22D3EE"];

export default function DashboardPage({ projectId }: { projectId?: string | null }) {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Tasks");
  const [showArchived, setShowArchived] = useState(false);
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);

  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "med" | "high">("med");
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
  const disabledInsightRules = new Set(state.userSettings.disabledInsightRules ?? []);

  const now = Date.now();
  const activeInsights = dedupeById(state.insights ?? []).items.filter((item) => {
    if (disabledInsightRules.has(item.ruleId)) return false;
    if (item.dismissedUntil && new Date(item.dismissedUntil).getTime() > now) return false;
    if (!showArchived && item.projectId) {
      const project = projects.find((candidate) => candidate.id === item.projectId);
      if (project && isArchivedProject(project)) return false;
    }
    return true;
  });

  const visibleProjects = showArchived ? projects : projects.filter((project) => !isArchivedProject(project));
  const selection = resolveProjectSelection(visibleProjects, selectedProjectId, projectId);
  const selectedProject = selection.selectedProject;

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

  const commitOptions = useMemo(() => {
    const remote = commitFeed.map(c => ({
      sha: c.sha,
      shortSha: c.sha.substring(0, 7),
      message: c.message
    }));
    const local = localCommitFeed.map(c => ({
      sha: c.sha,
      shortSha: c.hash || c.sha.substring(0, 7),
      message: c.message
    }));
    return [...local, ...remote];
  }, [commitFeed, localCommitFeed]);

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

  const persistState = async (
    mutate: (draft: AppState) => void,
    failureMessage = "Failed to save changes."
  ) => {
    const next = cloneAppState(state);
    mutate(next);
    const saved = await save(next);
    if (!saved) {
      push(failureMessage, "error");
      return null;
    }
    return next;
  };

  useEffect(() => {
    if (selection.selectedProjectId !== selectedProjectId) {
      setSelectedProjectId(selection.selectedProjectId);
      return;
    }
  }, [selectedProjectId, selection.selectedProjectId]);

  useEffect(() => {
    setCommitFeed([]);
    setLocalCommitFeed([]);
  }, [selectedProject?.id]);

  useEffect(() => {
    const saved = state.todayPlanByDate?.[todayKey()];
    setTodayPlanNotes(saved?.notes ?? "");
    if (saved && saved.taskIds.length > 0) {
      setTodayPlanDraft(saved.taskIds);
    } else {
      // No saved plan for today — auto-compute from unfinished tasks so Today's Mission is never blank
      const taskList = projects.flatMap((project) =>
        project.tasks.map((task) => ({
          task,
          projectId: project.id,
          projectName: project.name,
          weeklyHours: project.weeklyHours,
          projectTaskList: project.tasks
        }))
      );
      const autoPlan = computeTodayPlan(taskList, { maxTasks: 5 });
      setTodayPlanDraft(autoPlan);
    }
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
    setOpenProjectMenu(null);
    setProjectModalOpen(true);
  };

  const openProjectSettings = (project: Project) => {
    setSelectedProjectId(project.id);
    setActiveTab("Project Settings");
    setOpenProjectMenu(null);
  };

  const moveProject = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= visibleProjects.length) return;
    const fromId = visibleProjects[idx].id;
    const toId = visibleProjects[target].id;
    await persistState((next) => {
      const fromIdx = next.projects.findIndex((p) => p.id === fromId);
      const toIdx = next.projects.findIndex((p) => p.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      [next.projects[fromIdx], next.projects[toIdx]] = [next.projects[toIdx], next.projects[fromIdx]];
    }, "Failed to reorder projects.");
  };

  const saveNewProject = async (draft: any) => {
    const created = createProjectFromDraft(
      draft,
      projectColors[state.projects.length % projectColors.length] ?? projectColors[0]
    );
    const saved = await persistState((next) => {
      next.projects.unshift(created);
    }, "Failed to create project.");
    if (!saved) return;
    setSelectedProjectId(created.id);
    setActiveTab("Tasks");
    setProjectModalOpen(false);
    push("Project created.", "success");
  };

  const saveProjectSettings = async (draft: any) => {
    if (!selectedProject) return;
    const saved = await persistState((next) => {
      const project = next.projects.find((item) => item.id === selectedProject.id);
      if (!project) return;
      const previousName = project.name;
      applyProjectDraftToProject(project, draft);
      next.roadmapCards = normalizeRoadmapProjectRefs(next.roadmapCards, project, [previousName]);
    }, "Failed to save project settings.");
    if (!saved) return;
    setActiveTab("Tasks");
    push("Settings saved.", "success");
  };

  const setProjectArchived = async (projectId: string, archived: boolean) => {
    const saved = await persistState((next) => {
      const project = next.projects.find((item) => item.id === projectId);
      if (!project) return;
      project.status = archived ? "Archived" : "In Progress";
      project.archivedAt = archived ? new Date().toISOString() : null;
      project.updatedAt = new Date().toISOString();
      next.roadmapCards = normalizeRoadmapProjectRefs(next.roadmapCards, project);
    }, archived ? "Failed to archive project." : "Failed to restore project.");
    if (!saved) return;
    push(archived ? "Project archived." : "Project restored.", "success");
    setOpenProjectMenu(null);
  };

  const deleteProject = async (projectId: string) => {
    const confirmed = window.confirm("Delete this project permanently? This cannot be undone.");
    if (!confirmed) return;
    const saved = await persistState((next) => {
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
    }, "Failed to delete project.");
    if (!saved) return;
    if (selectedProjectId === projectId) setSelectedProjectId(null);
    setOpenProjectMenu(null);
    push("Project deleted.", "success");
  };

  const handleAddGoal = async () => {
    if (!todayEntry) return;
    const title = window.prompt("New goal");
    if (!title) return;
    await persistState((next) => {
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
    }, "Failed to add goal.");
  };

  const handleSaveTemplate = async () => {
    if (!todayEntry) return;
    const saved = await persistState((next) => {
      next.userSettings.goalTemplate = todayEntry.goals.map((goal) => ({ ...goal }));
    }, "Failed to save goal template.");
    if (!saved) return;
    push("Goal template saved.", "success");
  };

  const addTask = async () => {
    if (!selectedProject || !taskText.trim()) return;
    const saved = await persistState((next) => {
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
    }, "Failed to add task.");
    if (!saved) return;
    setTaskText("");
    setTaskDue("");
    setTaskPriority("med");
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!selectedProject) return;
    const next = cloneAppState(state);
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
    const saved = await save(next);
    if (!saved) {
      push("Failed to update task.", "error");
    }
  };

  const updateTaskStatus = async (taskId: string, status: "todo" | "doing" | "done") => {
    if (!selectedProject) return;
    const next = cloneAppState(state);
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
    const saved = await save(next);
    if (!saved) {
      push("Failed to update task status.", "error");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!selectedProject) return;
    await persistState((next) => {
      const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
      if (!project) return;
      project.tasks = project.tasks.filter((task) => task.id !== taskId);
      next.todayPlanByDate = Object.fromEntries(
        Object.entries(next.todayPlanByDate).map(([date, plan]) => [
          date,
          { ...plan, taskIds: plan.taskIds.filter((id) => id !== taskId) }
        ])
      );
    }, "Failed to delete task.");
    setTodayPlanDraft((prev) => prev.filter((id) => id !== taskId));
  };

  const updateTaskDependencies = async (taskId: string, deps: string[]) => {
    if (!selectedProject) return;
    const next = cloneAppState(state);
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.dependsOnIds = deps;
    const saved = await save(next);
    if (!saved) {
      push("Failed to update task dependencies.", "error");
    }
  };

  const updateTaskPriority = async (taskId: string, priority: "low" | "med" | "high") => {
    if (!selectedProject) return;
    const next = cloneAppState(state);
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.priority = priority;
    const saved = await save(next);
    if (!saved) {
      push("Failed to update task priority.", "error");
    }
  };

  const adjustHours = async (projectId: string, delta: number) => {
    const saved = await persistState((next) => {
      const project = next.projects.find((candidate) => candidate.id === projectId);
      if (!project) return;
      project.weeklyHours = Math.max(0, Math.min(40, project.weeklyHours + delta));
    }, "Failed to update weekly hours.");
    if (!saved) return;
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

  const loadLocalCommits = async () => {
    if (!selectedProject?.localRepoPath) return;
    try {
      const response = await api.gitLocalCommits(state, selectedProject.localRepoPath, 8);
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
    await persistState((next) => {
      next.roadmapCards = next.roadmapCards.map((card) =>
        card.id === id ? { ...card, lane, updatedAt: new Date().toISOString() } : card
      );
    }, "Failed to update roadmap card.");
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
    const saved = await persistState((next) => {
      next.todayPlanByDate[todayKey()] = {
        taskIds,
        generatedAt: new Date().toISOString(),
        source,
        notes: todayPlanNotes.trim() || null
      };
    }, "Failed to save today plan.");
    if (!saved) return;
    push(source === "auto" ? "Today plan auto-generated." : "Today plan saved.", "success");
  };

  const buildMyPlanWithAI = async () => {
    try {
      return await api.buildMyPlan(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI plan generation failed";
      // If the error is a configuration issue, surface it clearly
      if (message.includes("not configured") || message.includes("ANTHROPIC_API_KEY")) {
        throw new Error(message);
      }
      // For transient errors, fall back to local heuristic
      push("AI unavailable, using local heuristic", "warning");
      const localPlan = generateAutoPlan();
      return {
        taskIds: localPlan,
        rationale: "Fell back to local heuristics: prioritized overdue, roadmap, and high-signal tasks."
      };
    }
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

    const saved = await persistState((next) => {
      next.focusSessions.unshift({
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        durationMinutes: 45,
        completedAt: null,
        planned: false,
        projectId: entry.project.id,
        reason: entry.task.text
      });
    }, "Failed to start focus session.");
    if (!saved) return;
    push(`Focus started for ${entry.project.name}. Timer UI is still stubbed.`, "success");
  };

  const saveTodayPlan = async () => {
    const dedupedTaskIds = Array.from(new Set(todayPlanDraft)).filter((taskId) => allTaskLookup.has(taskId)).slice(0, 7);
    setTodayPlanDraft(dedupedTaskIds);
    await persistTodayPlan(dedupedTaskIds, "manual");
  };

  const applyInsightActionLocally = async (group: InsightGroup, action: SuggestedAction) => {
    const next = cloneAppState(state);

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
      return save(next);
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
      return save(next);
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
      return save(next);
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
      return save(next);
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
      return save(next);
    }

    return false;
  };

  const runInsightAction = async (group: InsightGroup, action: SuggestedAction) => {
    if (action.type === "COPY_REPO_PATH") {
      try {
        const applied = await applyInsightActionLocally(group, action);
        if (!applied) {
          push("No repo path available for this insight.", "warning");
          return;
        }
        push(successMessageForInsightAction(action.type), "success");
      } catch (err) {
        push(err instanceof Error ? err.message : "Insight action failed.", "warning");
      }
      return;
    }

    try {
      if (action.type === "OPEN_REPO") {
        await api.insightAction(state, action);
        push(successMessageForInsightAction(action.type), "success");
        return;
      }

      const applied = await applyInsightActionLocally(group, action);
      if (!applied) {
        push(`Action unavailable in this build: ${action.label}.`, "warning");
        return;
      }
      push(successMessageForInsightAction(action.type), "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Insight action failed.", "warning");
    }
  };

  const topPlanTaskId = todayPlanDraft[0] ?? null;
  const topPlanTaskEntry = topPlanTaskId ? allTaskLookup.get(topPlanTaskId) : null;
  const topTask = topPlanTaskEntry ? {
    id: topPlanTaskEntry.task.id,
    text: topPlanTaskEntry.task.text,
    projectName: topPlanTaskEntry.project.name
  } : null;

  return (
    <>
      <div className="mb-6">
        <TodayMissionHero
          topTask={topTask}
          tasksRemaining={todayPlanDraft.length}
          onStartFocus={startFocus}
        />
      </div>

      <GlassPanel variant="hero" className="mb-6">
        <SectionHeader
          title="Projects"
          subtitle={showArchived ? "All projects" : "Active projects"}
          rightControls={
            <button className="button-secondary" onClick={openCreateProjectModal}>+ New</button>
          }
        />
        <div className={`mt-5 grid gap-4 ${
          visibleProjects.length === 1 ? "grid-cols-1 sm:grid-cols-2" :
          visibleProjects.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
          visibleProjects.length === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
          "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        }`}>
          {visibleProjects.map((project, idx) => (
            <div key={project.id} className="relative group/card">
              <ProjectCard
                project={project}
                isSelected={selectedProject?.id === project.id}
                onClick={() => { setSelectedProjectId(project.id); setActiveTab("Tasks"); }}
                size={visibleProjects.length <= 2 ? "lg" : visibleProjects.length <= 3 ? "md" : "sm"}
              />
              <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); moveProject(idx, -1); }}
                    className="p-1 rounded bg-black/50 hover:bg-black/70 text-muted hover:text-white transition text-xs"
                    title="Move left"
                  >←</button>
                )}
                {idx < visibleProjects.length - 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); moveProject(idx, 1); }}
                    className="p-1 rounded bg-black/50 hover:bg-black/70 text-muted hover:text-white transition text-xs"
                    title="Move right"
                  >→</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - Selected Project Command Center */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <GlassPanel variant="standard" className="flex-1 flex flex-col">
            <div className="flex gap-4 items-center mb-6 pb-6 border-b border-subtle">
              <div className="w-16 h-16 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(139,92,246,0.15)] flex-shrink-0">
                {selectedProject?.icon ?? "👤"}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-2xl tracking-tight truncate text-white">{selectedProject?.name ?? "Global view"}</h3>
                <p className="text-sm text-muted mt-1 truncate font-medium">{selectedProject?.subtitle ?? "Select a project above"}</p>
              </div>
              <div className="flex gap-6 text-center shrink-0 items-center">
                <div>
                  <strong className="block text-2xl font-bold mb-1">{selectedProject?.tasks.length ?? 0}</strong>
                  <span className="text-muted text-[10px] uppercase tracking-[0.2em] font-bold">Tasks</span>
                </div>
                <div>
                  <strong className="block text-2xl font-bold mb-1 text-emerald-400">{selectedProjectTaskProgress}%</strong>
                  <span className="text-emerald-500/70 text-[10px] uppercase tracking-[0.2em] font-bold">Done</span>
                </div>
                {selectedProject && (
                  <button className="button-secondary p-2 ml-2" onClick={() => setActiveTab("Project Settings")} aria-label="Project Settings">
                    <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <SectionHeader title="Tasks" />
            <div className="mt-4 flex-1 grid gap-2 overflow-y-auto pr-2 min-h-[300px]">
              {selectedTasks.length === 0 && <p className="text-sm text-muted flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>No tasks.</p>}
              {selectedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  text={task.text}
                  done={task.done}
                  onToggle={(nextValue) => toggleTask(task.id, nextValue)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </div>
            <div className="flex gap-3 mt-6 mb-6">
              <input
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="New task..."
                className="input flex-1 bg-white/5 border-white/5 text-base py-3"
              />
              <button onClick={addTask} className="button-secondary px-6">Add</button>
            </div>

            {selectedProject && (
              <div className="mt-2 pt-6 border-t border-subtle">
                <SectionHeader title="Action Log" subtitle="Notes, blockers, ideas" />
                <div className="mt-4">
                  <ProjectJournalPanel
                    project={selectedProject}
                    tasks={selectedProject.tasks}
                    roadmapCards={filteredRoadmap}
                    journalEntries={state.journalEntries.filter(entry => entry.projectId === selectedProject.id)}
                    repo={selectedProjectRepo}
                    commitOptions={commitOptions}
                  />
                </div>
              </div>
            )}
          </GlassPanel>
        </div>

        {/* Right Column - Secondary Systems */}
        <div className="flex flex-col gap-6">
          <TodayPlanQueue
            planDraft={todayPlanDraft}
            allTaskLookup={allTaskLookup}
            onBuildPlan={buildMyPlanWithAI}
            onSave={persistTodayPlan}
            onRemove={removePlanItem}
            onStartFocus={startFocus}
          />

          <GlassPanel variant="standard" className="flex flex-col justify-center h-28">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted mb-3 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Weekly Time Budget
            </div>
            <div className="flex justify-between items-end">
              <div className="text-3xl font-bold tracking-tight text-white">{totalHours} <span className="text-lg text-muted font-semibold tracking-normal">hrs</span></div>
              <div className="text-xs font-bold text-accent-2 uppercase tracking-widest">{selectedProjectBudgetShare}% Active</div>
            </div>
          </GlassPanel>

          <GlassPanel variant="standard" className="flex flex-col h-[400px]">
            <SectionHeader title="Signals & Insights" />
            <SignalActionPanel groupedInsights={groupedInsights} runInsightAction={runInsightAction} />
          </GlassPanel>

          <GlassPanel variant="standard" className="flex flex-col h-[200px]">
            <SectionHeader title="Local Git" subtitle={selectedProjectRepo?.name} />
            <div className="mt-4 flex-1 flex flex-col pt-4 items-center justify-center text-center">
              <div className="text-4xl mb-3 text-subtle/50">⎇</div>
              <div className="font-bold mb-1 text-base text-white/90">{selectedProject?.localRepoPath ? `${selectedProjectRepo?.todayCommitCount ?? 0} Commits Today` : "Not Linked"}</div>
              <p className="text-xs text-muted mb-0">{selectedProject?.localRepoPath ? "Tree is clean" : "Update project settings to link repo."}</p>
              {!selectedProject?.localRepoPath && (
                <button className="text-[10px] uppercase font-bold tracking-widest text-accent mt-4 hover:text-accent-100" onClick={() => setActiveTab("Project Settings")}>Link Repo →</button>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>

      <ProjectModal
        open={projectModalOpen}
        project={null}
        repos={uniqueRepos}
        onClose={() => setProjectModalOpen(false)}
        onSave={saveNewProject}
        onArchive={() => { }}
        onDelete={() => { }}
      />

      <ProjectModal
        open={activeTab === "Project Settings" && !!selectedProject}
        project={selectedProject}
        repos={uniqueRepos}
        onClose={() => setActiveTab("Tasks")}
        onSave={saveProjectSettings}
        onArchive={(archive) => selectedProject && setProjectArchived(selectedProject.id, archive)}
        onDelete={() => selectedProject && deleteProject(selectedProject.id)}
      />
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

function clampWeeklyHours(value: number) {
  return Math.max(0, Math.min(40, value));
}

function createProjectFromDraft(draft: ProjectDraft, color: string): Project {
  const nowIso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: draft.name.trim(),
    subtitle: draft.subtitle.trim(),
    icon: draft.icon,
    color,
    status: draft.status,
    progress: 0,
    weeklyHours: clampWeeklyHours(Number(draft.weeklyHours) || 0),
    githubRepo: draft.remoteRepo?.trim() || null,
    remoteRepo: draft.remoteRepo?.trim() || null,
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
  project.icon = draft.icon;
  project.status = draft.status;
  project.weeklyHours = clampWeeklyHours(Number(draft.weeklyHours) || 0);
  project.githubRepo = draft.remoteRepo?.trim() || null;
  project.remoteRepo = draft.remoteRepo?.trim() || null;
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
