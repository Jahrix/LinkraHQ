import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";
import {
  insightRules,
  RoadmapLaneSchema,
  SuggestedActionSchema,
  type Insight,
  type SuggestedAction
} from "@linkra/shared";
import type { AppState, LocalRepo, Project } from "@linkra/shared";

const execFileAsync = promisify(execFile);

function buildId(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function isDismissed(existing: Insight | undefined) {
  if (!existing?.dismissedUntil) return false;
  return new Date(existing.dismissedUntil).getTime() > Date.now();
}

function findExisting(state: AppState, ruleId: string, projectId?: string | null, repoId?: string | null) {
  return state.insights.find(
    (insight) =>
      insight.ruleId === ruleId &&
      (projectId ?? null) === (insight.projectId ?? null) &&
      (repoId ?? null) === (insight.repoId ?? null)
  );
}

function createInsight({
  ruleId,
  severity,
  title,
  reason,
  metrics,
  projectId,
  repoId,
  actions
}: {
  ruleId: string;
  severity: "info" | "warn" | "crit";
  title: string;
  reason: string;
  metrics: Record<string, any>;
  projectId?: string | null;
  repoId?: string | null;
  actions?: SuggestedAction[];
}): Insight {
  const timestamp = nowIso();
  return {
    id: buildId(`${ruleId}:${projectId ?? "global"}:${repoId ?? "none"}`),
    ts: timestamp,
    severity,
    projectId: projectId ?? null,
    repoId: repoId ?? null,
    ruleId,
    title,
    reason,
    metrics,
    suggestedActions: actions ?? [],
    dismissedUntil: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function action(id: string, type: SuggestedAction["type"], label: string, payload: Record<string, any> = {}) {
  return { id, type, label, payload };
}

function normalizeRepoPath(repoPath: string) {
  return path.resolve(repoPath);
}

function isUrlLike(value: string) {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol);
  } catch {
    return false;
  }
}

function findProject(state: AppState, projectId?: string | null) {
  if (!projectId) {
    return null;
  }
  return state.projects.find((project) => project.id === projectId) ?? null;
}

function findInsight(state: AppState, insightId?: string | null) {
  if (!insightId) {
    return null;
  }
  return state.insights.find((insight) => insight.id === insightId) ?? null;
}

function findKnownRepo(state: AppState, repoPath: string) {
  const normalizedPath = normalizeRepoPath(repoPath);
  return (
    state.localRepos.find((repo) => normalizeRepoPath(repo.path) === normalizedPath) ?? null
  );
}

function validateKnownRepoPath(state: AppState, repoPath: unknown) {
  if (typeof repoPath !== "string") {
    return { ok: false as const, error: "repoPath must be a string" };
  }

  const trimmed = repoPath.trim();
  if (!trimmed) {
    return { ok: false as const, error: "repoPath is required" };
  }
  if (trimmed.includes("\u0000")) {
    return { ok: false as const, error: "repoPath is invalid" };
  }
  if (isUrlLike(trimmed)) {
    return { ok: false as const, error: "repoPath must be a local filesystem path" };
  }

  const normalizedPath = normalizeRepoPath(trimmed);
  const repo = findKnownRepo(state, normalizedPath);
  if (!repo) {
    return { ok: false as const, error: "repoPath must match a known local repository" };
  }

  return { ok: true as const, repo, repoPath: normalizedPath };
}

export function validateInsightAction(state: AppState, actionInput: unknown) {
  const parsed = SuggestedActionSchema.safeParse(actionInput);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.message };
  }

  const action = parsed.data;
  const payload = action.payload ?? {};

  if (action.type === "CREATE_TASK") {
    const schema = z.object({
      projectId: z.string().min(1),
      title: z.string().trim().min(1).max(200)
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    const project = findProject(state, result.data.projectId);
    if (!project || project.status === "Archived") {
      return { ok: false as const, error: "projectId must reference an active project" };
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  if (action.type === "SCHEDULE_FOCUS") {
    const schema = z.object({
      projectId: z.string().min(1).nullable().optional(),
      minutes: z.number().int().min(5).max(480).default(45),
      reason: z.string().trim().min(1).max(200).nullable().optional()
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    if (result.data.projectId) {
      const project = findProject(state, result.data.projectId);
      if (!project || project.status === "Archived") {
        return { ok: false as const, error: "projectId must reference an active project" };
      }
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  if (action.type === "MOVE_ROADMAP_NOW") {
    const schema = z.object({
      cardId: z.string().min(1)
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    const card = state.roadmapCards.find((item) => item.id === result.data.cardId);
    if (!card) {
      return { ok: false as const, error: "cardId must reference an existing roadmap card" };
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  if (action.type === "MOVE_ROADMAP_CARD") {
    const schema = z.object({
      cardId: z.string().min(1),
      lane: RoadmapLaneSchema
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    const card = state.roadmapCards.find((item) => item.id === result.data.cardId);
    if (!card) {
      return { ok: false as const, error: "cardId must reference an existing roadmap card" };
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  if (action.type === "COPY_REPO_PATH" || action.type === "OPEN_REPO") {
    const repo = validateKnownRepoPath(state, payload.repoPath);
    if (!repo.ok) {
      return repo;
    }
    return {
      ok: true as const,
      action: {
        ...action,
        payload: {
          repoPath: repo.repoPath
        }
      }
    };
  }

  if (action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W" || action.type === "DISMISS") {
    const schema = z.object({
      insightId: z.string().min(1)
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    if (!findInsight(state, result.data.insightId)) {
      return { ok: false as const, error: "insightId must reference an existing insight" };
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  if (action.type === "CREATE_JOURNAL") {
    const schema = z.object({
      projectId: z.string().min(1).nullable().optional(),
      entryType: z.enum(["note", "decision", "blocker", "next", "idea"]).default("note"),
      title: z.string().trim().max(200).nullable().optional(),
      body: z.string().trim().min(1).max(4000)
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    if (result.data.projectId) {
      const project = findProject(state, result.data.projectId);
      if (!project || project.status === "Archived") {
        return { ok: false as const, error: "projectId must reference an active project" };
      }
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  if (action.type === "ARCHIVE_PROJECT") {
    const schema = z.object({
      projectId: z.string().min(1)
    });
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { ok: false as const, error: result.error.message };
    }
    const project = findProject(state, result.data.projectId);
    if (!project || project.status === "Archived") {
      return { ok: false as const, error: "projectId must reference an active project" };
    }
    return { ok: true as const, action: { ...action, payload: result.data } };
  }

  return { ok: false as const, error: "action type is not allowed" };
}

export function computeInsights(state: AppState): Insight[] {
  const disabled = new Set(state.userSettings.disabledInsightRules ?? []);
  const rules = insightRules.filter((rule) => !disabled.has(rule.id));
  const now = new Date();
  const insights: Insight[] = [];
  const activeProjects = state.projects.filter((project) => project.status !== "Archived");

  const scanTimes = state.localRepos
    .map((repo) => repo.scannedAt)
    .filter(Boolean)
    .sort();
  const lastScanAt = scanTimes[scanTimes.length - 1] ?? null;

  for (const rule of rules) {
    if (rule.id === "STALE_REPO") {
      const days = Number(rule.settings?.days ?? 7);
      for (const repo of state.localRepos) {
        const lastCommit = repo.lastCommitAt ? new Date(repo.lastCommitAt) : null;
        if (!lastCommit) continue;
        const ageDays = (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays >= days) {
          const project = activeProjects.find((p) => p.localRepoPath === repo.path);
          const existing = findExisting(state, rule.id, project?.id, repo.id);
          if (isDismissed(existing)) continue;
          insights.push(
            createInsight({
              ruleId: rule.id,
              severity: rule.severity,
              title: "Repo is stale",
              reason: `No commits in ${Math.floor(ageDays)} days.`,
              metrics: { ageDays, days },
              projectId: project?.id,
              repoId: repo.id,
              actions: [
                action("create-task", "CREATE_TASK", "Add task: review repo", {
                  projectId: project?.id,
                  title: `Review ${repo.name} and ship a commit`
                }),
                action("schedule-focus", "SCHEDULE_FOCUS", "Schedule 45m focus", {
                  projectId: project?.id,
                  minutes: 45
                }),
                action("open-repo", "OPEN_REPO", "Open repo", { repoPath: repo.path })
              ]
            })
          );
        }
      }
    }

    if (rule.id === "DEAD_WEIGHT") {
      const days = Number(rule.settings?.days ?? 14);
      for (const project of activeProjects) {
        const pUpdated = new Date(project.updatedAt).getTime();
        const repo = project.localRepoPath ? state.localRepos.find(r => r.path === project.localRepoPath) : null;
        const lastCommit = repo?.lastCommitAt ? new Date(repo.lastCommitAt).getTime() : 0;

        const lastActive = Math.max(pUpdated, lastCommit);
        if (lastActive > 0) {
          const ageDays = (now.getTime() - lastActive) / (1000 * 60 * 60 * 24);
          if (ageDays >= days) {
            const existing = findExisting(state, rule.id, project.id, null);
            if (isDismissed(existing)) continue;
            insights.push(
              createInsight({
                ruleId: rule.id,
                severity: "crit",
                title: "Dead Weight",
                reason: `${project.name} has been untouched for ${Math.floor(ageDays)} days.`,
                metrics: { ageDays, days },
                projectId: project.id,
                actions: [
                  action("archive-project", "ARCHIVE_PROJECT", "Archive Project", { projectId: project.id }),
                  action("schedule-focus", "SCHEDULE_FOCUS", "Revive (30m focus)", { projectId: project.id, minutes: 30 })
                ]
              })
            );
          }
        }
      }
    }

    if (rule.id === "DIRTY_DEBT") {
      const days = Number(rule.settings?.days ?? 3);
      for (const repo of state.localRepos) {
        if (!repo.dirty) continue;
        const lastCommit = repo.lastCommitAt ? new Date(repo.lastCommitAt) : null;
        if (!lastCommit) continue;
        const ageDays = (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays >= days) {
          const project = activeProjects.find((p) => p.localRepoPath === repo.path);
          const existing = findExisting(state, rule.id, project?.id, repo.id);
          if (isDismissed(existing)) continue;
          insights.push(
            createInsight({
              ruleId: rule.id,
              severity: ageDays > days + 2 ? "crit" : rule.severity,
              title: "Working tree is dirty",
              reason: `Uncommitted changes for ${Math.floor(ageDays)} days.`,
              metrics: { ageDays, days, untracked: repo.untrackedCount },
              projectId: project?.id,
              repoId: repo.id,
              actions: [
                action("create-task", "CREATE_TASK", "Add task: clean working tree", {
                  projectId: project?.id,
                  title: `Clean working tree in ${repo.name}`
                }),
                action("copy-path", "COPY_REPO_PATH", "Copy repo path", { repoPath: repo.path })
              ]
            })
          );
        }
      }
    }

    if (rule.id === "OVERDUE_TASKS") {
      const overdue = activeProjects.flatMap((project) =>
        project.tasks
          .filter((task) => task.dueDate && !task.done && new Date(task.dueDate) < now)
          .map((task) => ({ project, task }))
      );
      const byProject = new Map<string, { project: Project; count: number }>();
      for (const item of overdue) {
        const entry = byProject.get(item.project.id) ?? { project: item.project, count: 0 };
        entry.count += 1;
        byProject.set(item.project.id, entry);
      }
      for (const { project, count } of byProject.values()) {
        const existing = findExisting(state, rule.id, project.id, null);
        if (isDismissed(existing)) continue;
        insights.push(
          createInsight({
            ruleId: rule.id,
            severity: count >= 3 ? "crit" : rule.severity,
            title: "Overdue tasks",
            reason: `${count} overdue tasks in ${project.name}.`,
            metrics: { overdue: count },
            projectId: project.id,
            actions: [
              action("schedule-focus", "SCHEDULE_FOCUS", "Schedule 45m focus", {
                projectId: project.id,
                minutes: 45
              })
            ]
          })
        );
      }
    }

    if (rule.id === "NO_NOW_ROADMAP") {
      const activeProjectIds = new Set(activeProjects.map((project) => project.id));
      const nowCards = state.roadmapCards.filter((card) => {
        if (card.lane !== "now") return false;
        if (!card.project) return true;
        return activeProjectIds.has(card.project) || activeProjects.some((project) => project.name === card.project);
      });
      if (nowCards.length === 0) {
        const existing = findExisting(state, rule.id, null, null);
        if (!isDismissed(existing)) {
          insights.push(
            createInsight({
              ruleId: rule.id,
              severity: rule.severity,
              title: "Nothing in the Now lane",
              reason: "Move at least one roadmap card to Now.",
              metrics: { nowCards: 0 },
              actions: [
                action("move-roadmap", "MOVE_ROADMAP_NOW", "Move a card to Now", {})
              ]
            })
          );
        }
      }
    }

    if (rule.id === "LOW_LOCKIN") {
      const todayKey = new Date().toISOString().slice(0, 10);
      const entry = state.dailyGoalsByDate[todayKey];
      const threshold = Number(rule.settings?.threshold ?? 50);
      if (entry) {
        const nowHour = now.getHours();
        if (nowHour >= 18 && entry.score < threshold) {
          const existing = findExisting(state, rule.id, null, null);
          if (!isDismissed(existing)) {
            insights.push(
              createInsight({
                ruleId: rule.id,
                severity: rule.severity,
                title: "Lock‑in score is low",
                reason: `Score is ${entry.score}% after 6pm.`,
                metrics: { score: entry.score, threshold },
                actions: [
                  action("schedule-focus", "SCHEDULE_FOCUS", "Schedule 30m focus", {
                    minutes: 30
                  })
                ]
              })
            );
          }
        }
      }
    }

    if (rule.id === "SCAN_STALE") {
      if (lastScanAt) {
        const last = new Date(lastScanAt).getTime();
        const interval = state.userSettings.repoScanIntervalMinutes ?? 15;
        const ageMinutes = (Date.now() - last) / (1000 * 60);
        if (ageMinutes > interval * 2) {
          const existing = findExisting(state, rule.id, null, null);
          if (!isDismissed(existing)) {
            insights.push(
              createInsight({
                ruleId: rule.id,
                severity: rule.severity,
                title: "Local git scan is stale",
                reason: `Last scan was ${Math.round(ageMinutes)} minutes ago.`,
                metrics: { ageMinutes, interval },
                actions: [
                  action("rescan", "SCHEDULE_FOCUS", "Schedule 15m focus", { minutes: 15 })
                ]
              })
            );
          }
        }
      }
    }
  }

  return insights;
}

export async function updateInsights(state: AppState) {
  const next = { ...state };
  const computed = computeInsights(state);
  const existingMap = new Map(state.insights.map((insight) => [insight.id, insight]));
  const activeInsights = computed
    .map((insight) => {
      const existing = existingMap.get(insight.id);
      if (existing && isDismissed(existing)) {
        return null;
      }
      if (existing) {
        return { ...existing, ...insight, updatedAt: nowIso() };
      }
      return insight;
    })
    .filter((item): item is Insight => Boolean(item));

  const retainedDismissed = state.insights.filter((insight) => isDismissed(insight));
  const merged = new Map<string, Insight>();
  for (const insight of retainedDismissed) {
    merged.set(insight.id, insight);
  }
  for (const insight of activeInsights) {
    merged.set(insight.id, insight);
  }
  next.insights = Array.from(merged.values()).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return next;
}

export async function runInsightAction(state: AppState, action: SuggestedAction) {
  const validated = validateInsightAction(state, action);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const safeAction = validated.action;
  const next = { ...state };
  const now = nowIso();

  if (safeAction.type === "CREATE_TASK") {
    const payload = safeAction.payload as { projectId: string; title: string };
    const project = next.projects.find((p) => p.id === payload.projectId);
    if (project) {
      project.tasks.unshift({
        id: crypto.randomUUID(),
        text: payload.title,
        done: false,
        status: "todo",
        dependsOnIds: [],
        priority: "med",
        dueDate: null,
        milestone: null,
        createdAt: now,
        completedAt: null,
        linkedCommit: null
      });
      project.updatedAt = now;
    }
  }

  if (safeAction.type === "SCHEDULE_FOCUS") {
    const payload = safeAction.payload as {
      minutes: number;
      projectId?: string | null;
      reason?: string | null;
    };
    const minutes = Number(payload.minutes ?? 45);
    next.focusSessions.unshift({
      id: crypto.randomUUID(),
      startedAt: now,
      durationMinutes: minutes,
      completedAt: null,
      planned: true,
      projectId: payload.projectId ?? null,
      reason: payload.reason ?? "Insight"
    });
  }

  if (safeAction.type === "MOVE_ROADMAP_NOW") {
    const payload = safeAction.payload as { cardId: string };
    const cardId = payload.cardId;
    const card = next.roadmapCards.find((c) => c.id === cardId) ?? next.roadmapCards[0];
    if (card) {
      card.lane = "now";
      card.updatedAt = now;
    }
  }

  if (safeAction.type === "MOVE_ROADMAP_CARD") {
    const payload = safeAction.payload as {
      cardId: string;
      lane: "now" | "next" | "later" | "shipped";
    };
    const cardId = payload.cardId;
    const lane = payload.lane ?? "now";
    const card = next.roadmapCards.find((c) => c.id === cardId) ?? next.roadmapCards[0];
    if (card) {
      card.lane = lane;
      card.updatedAt = now;
    }
  }

  if (safeAction.type === "CREATE_JOURNAL") {
    const payload = safeAction.payload as {
      projectId?: string | null;
      entryType: "note" | "decision" | "blocker" | "next" | "idea";
      title?: string | null;
      body: string;
    };
    next.journalEntries.unshift({
      id: crypto.randomUUID(),
      projectId: payload.projectId ?? null,
      ts: now,
      type: payload.entryType ?? "note",
      title: payload.title ?? null,
      body: payload.body,
      links: {
        taskIds: [],
        roadmapCardIds: [],
        repoIds: [],
        commitShas: []
      },
      tags: [],
      createdAt: now,
      updatedAt: now
    });
  }

  if (safeAction.type === "OPEN_REPO") {
    const payload = safeAction.payload as { repoPath: string };
    const repoPath = payload.repoPath;
    if (repoPath) {
      const platform = process.platform;
      const command =
        platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open";
      await execFileAsync(command, [repoPath]).catch(() => null);
    }
  }

  if (safeAction.type === "ARCHIVE_PROJECT") {
    const payload = safeAction.payload as { projectId: string };
    const project = next.projects.find((p) => p.id === payload.projectId);
    if (project) {
      project.status = "Archived";
      project.archivedAt = now;
      project.updatedAt = now;

      // Auto-dismiss all insights associated with this project that triggered it.
      next.insights = next.insights.filter((item) => item.projectId !== project.id);
    }
  }

  next.sessionLogs.unshift({
    id: crypto.randomUUID(),
    ts: now,
    text: `Insight action: ${safeAction.type}`,
    project: "projectId" in safeAction.payload ? (safeAction.payload.projectId as string | null) ?? null : null,
    tags: ["insight"]
  });

  if (safeAction.type === "SNOOZE_1D" || safeAction.type === "SNOOZE_1W") {
    const payload = safeAction.payload as { insightId: string };
    const insight = next.insights.find((item) => item.id === payload.insightId);
    if (insight) {
      const days = safeAction.type === "SNOOZE_1W" ? 7 : 1;
      const until = new Date();
      until.setDate(until.getDate() + days);
      insight.dismissedUntil = until.toISOString();
      insight.updatedAt = now;
    }
  }

  if (safeAction.type === "DISMISS") {
    const payload = safeAction.payload as { insightId: string };
    const insight = next.insights.find((item) => item.id === payload.insightId);
    if (insight) {
      insight.dismissedUntil = null;
      insight.updatedAt = now;
      next.insights = next.insights.filter((item) => item.id !== insight.id);
    }
  }

  return next;
}
