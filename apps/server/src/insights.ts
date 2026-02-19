import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { insightRules, type Insight, type SuggestedAction } from "@linkra/shared";
import type { AppState, LocalRepo, Project } from "@linkra/shared";
import { saveState } from "./store.js";

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

export function computeInsights(state: AppState): Insight[] {
  const disabled = new Set(state.userSettings.disabledInsightRules ?? []);
  const rules = insightRules.filter((rule) => !disabled.has(rule.id));
  const now = new Date();
  const insights: Insight[] = [];

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
          const project = state.projects.find((p) => p.localRepoPath === repo.path);
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

    if (rule.id === "DIRTY_DEBT") {
      const days = Number(rule.settings?.days ?? 3);
      for (const repo of state.localRepos) {
        if (!repo.dirty) continue;
        const lastCommit = repo.lastCommitAt ? new Date(repo.lastCommitAt) : null;
        if (!lastCommit) continue;
        const ageDays = (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays >= days) {
          const project = state.projects.find((p) => p.localRepoPath === repo.path);
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
      const overdue = state.projects.flatMap((project) =>
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
      const nowCards = state.roadmapCards.filter((card) => card.lane === "now");
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
  next.insights = computed
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
  await saveState(next);
  return next;
}

export async function runInsightAction(state: AppState, action: SuggestedAction) {
  const next = { ...state };
  const now = nowIso();

  if (action.type === "CREATE_TASK") {
    const project = next.projects.find((p) => p.id === action.payload.projectId);
    if (project && action.payload.title) {
      project.tasks.unshift({
        id: crypto.randomUUID(),
        text: action.payload.title,
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
    }
  }

  if (action.type === "SCHEDULE_FOCUS") {
    const minutes = Number(action.payload.minutes ?? 45);
    next.focusSessions.unshift({
      id: crypto.randomUUID(),
      startedAt: now,
      durationMinutes: minutes,
      completedAt: null,
      planned: true,
      projectId: action.payload.projectId ?? null,
      reason: action.payload.reason ?? "Insight"
    });
  }

  if (action.type === "MOVE_ROADMAP_NOW") {
    const cardId = action.payload.cardId;
    const card = next.roadmapCards.find((c) => c.id === cardId) ?? next.roadmapCards[0];
    if (card) {
      card.lane = "now";
      card.updatedAt = now;
    }
  }

  if (action.type === "CREATE_JOURNAL") {
    next.journalEntries.unshift({
      id: crypto.randomUUID(),
      projectId: action.payload.projectId ?? null,
      ts: now,
      type: action.payload.entryType ?? "note",
      title: action.payload.title ?? null,
      body: action.payload.body ?? "",
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

  if (action.type === "OPEN_REPO") {
    const repoPath = action.payload.repoPath;
    if (repoPath) {
      const platform = process.platform;
      const command =
        platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open";
      await execFileAsync(command, [repoPath]).catch(() => null);
    }
  }

  next.sessionLogs.unshift({
    id: crypto.randomUUID(),
    ts: now,
    text: `Insight action: ${action.type}`,
    project: action.payload.projectId ?? null,
    tags: ["insight"]
  });

  if (action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W") {
    const insight = next.insights.find((item) => item.id === action.payload.insightId);
    if (insight) {
      const days = action.type === "SNOOZE_1W" ? 7 : 1;
      const until = new Date();
      until.setDate(until.getDate() + days);
      insight.dismissedUntil = until.toISOString();
      insight.updatedAt = now;
    }
  }

  await saveState(next);
  return next;
}
