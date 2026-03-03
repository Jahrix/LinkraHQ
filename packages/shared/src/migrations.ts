import {
  AppStateSchema,
  ExportBundleSchema,
  SCHEMA_VERSION,
  type AppState,
  type ExportBundle
} from "./schema.js";

const VALID_PROJECT_STATUSES = new Set([
  "Not Started",
  "In Progress",
  "Review",
  "On Hold",
  "Done",
  "Archived"
]);
const VALID_ROADMAP_LANES = new Set(["now", "next", "later", "shipped"]);
const VALID_JOURNAL_TYPES = new Set(["note", "decision", "blocker", "next", "idea"]);
const VALID_QUICK_CAPTURE_TYPES = new Set(["note", "task", "roadmap", "journal"]);

function toIso(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value) return fallback;
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? fallback : asDate.toISOString();
}

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fallbackId(prefix: string, index: number) {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 10)}`;
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toProjectStatus(status: unknown) {
  if (typeof status === "string" && VALID_PROJECT_STATUSES.has(status)) {
    return status as "Not Started" | "In Progress" | "Review" | "On Hold" | "Done" | "Archived";
  }
  return "Not Started" as const;
}

function migrateStateToCurrent(state: any): AppState {
  const now = new Date().toISOString();
  const rawProjects = Array.isArray(state?.projects) ? state.projects : [];

  const projects: AppState["projects"] = rawProjects.map((project: any, projectIndex: number) => {
    const status = toProjectStatus(project?.status);
    const createdAt = toIso(project?.createdAt, state?.metadata?.created_at ?? now);
    const updatedAt = toIso(project?.updatedAt, now);
    const archivedAt = status === "Archived" ? toIso(project?.archivedAt, updatedAt) : null;

    const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
    const migratedTasks = tasks.map((task: any, taskIndex: number) => {
      const done = Boolean(task?.done);
      let statusValue = task?.status;
      if (statusValue !== "todo" && statusValue !== "doing" && statusValue !== "done") {
        statusValue = done ? "done" : "todo";
      }
      if (done && statusValue !== "done") {
        statusValue = "done";
      }
      if (!done && statusValue === "done") {
        statusValue = "todo";
      }

      const taskCreatedAt = toIso(task?.createdAt ?? task?.completedAt, createdAt);
      const taskCompletedAt = done || statusValue === "done" ? toIso(task?.completedAt, taskCreatedAt) : null;
      const linkedCommit =
        typeof task?.linkedCommit?.sha === "string" && task.linkedCommit.sha
          ? {
              sha: task.linkedCommit.sha,
              shortSha:
                typeof task.linkedCommit.shortSha === "string" && task.linkedCommit.shortSha
                  ? task.linkedCommit.shortSha
                  : task.linkedCommit.sha.slice(0, 7),
              message: typeof task.linkedCommit.message === "string" ? task.linkedCommit.message : "",
              author: typeof task.linkedCommit.author === "string" ? task.linkedCommit.author : "Unknown",
              date: toIso(task.linkedCommit.date, taskCompletedAt ?? taskCreatedAt),
              url: typeof task.linkedCommit.url === "string" ? task.linkedCommit.url : null,
              score: toFiniteNumber(task.linkedCommit.score, 0)
            }
          : null;

      return {
        id:
          typeof task?.id === "string" && task.id
            ? task.id
            : fallbackId(`task-${project?.id ?? projectIndex}`, taskIndex),
        text:
          typeof task?.text === "string" && task.text.trim()
            ? task.text.trim()
            : `Task ${taskIndex + 1}`,
        done,
        status: statusValue,
        dependsOnIds: toStringArray(task?.dependsOnIds),
        priority: task?.priority === "low" || task?.priority === "high" ? task.priority : "med",
        dueDate: typeof task?.dueDate === "string" && task.dueDate ? task.dueDate : null,
        milestone: typeof task?.milestone === "string" && task.milestone ? task.milestone : null,
        createdAt: taskCreatedAt,
        completedAt: taskCompletedAt,
        linkedCommit
      };
    });

    return {
      id:
        typeof project?.id === "string" && project.id
          ? project.id
          : fallbackId("project", projectIndex),
      name:
        typeof project?.name === "string" && project.name.trim()
          ? project.name.trim()
          : `Project ${projectIndex + 1}`,
      subtitle: typeof project?.subtitle === "string" ? project.subtitle : "",
      icon: typeof project?.icon === "string" && project.icon ? project.icon : "🧩",
      color: typeof project?.color === "string" && project.color ? project.color : "#8b5cf6",
      status,
      progress: toFiniteNumber(project?.progress, 0),
      weeklyHours: toFiniteNumber(project?.weeklyHours, 0),
      githubRepo: typeof project?.githubRepo === "string" && project.githubRepo ? project.githubRepo : null,
      remoteRepo:
        typeof project?.remoteRepo === "string" && project.remoteRepo
          ? project.remoteRepo
          : typeof project?.githubRepo === "string" && project.githubRepo
          ? project.githubRepo
          : null,
      localRepoPath: typeof project?.localRepoPath === "string" && project.localRepoPath ? project.localRepoPath : null,
      healthScore:
        typeof project?.healthScore === "number" && Number.isFinite(project.healthScore)
          ? project.healthScore
          : null,
      archivedAt,
      createdAt,
      updatedAt,
      tasks: migratedTasks
    };
  });

  const projectNameToId = new Map(
    projects
      .map((project: AppState["projects"][number]) => [project.name, project.id] as const)
      .filter((entry: readonly [string, string]): entry is readonly [string, string] => Boolean(entry[0] && entry[1]))
  );

  const mapProjectRef = (projectRef: unknown) => {
    if (typeof projectRef !== "string" || !projectRef) return null;
    if (projectNameToId.has(projectRef)) return projectNameToId.get(projectRef) ?? null;
    return projectRef;
  };

  const migratedRoadmap = (Array.isArray(state?.roadmapCards) ? state.roadmapCards : []).map((card: any, index: number) => {
    const cardCreatedAt = toIso(card?.createdAt, state?.metadata?.created_at ?? now);
    const cardUpdatedAt = toIso(card?.updatedAt ?? card?.createdAt, cardCreatedAt);

    return {
      id:
        typeof card?.id === "string" && card.id
          ? card.id
          : fallbackId("roadmap", index),
      lane:
        typeof card?.lane === "string" && VALID_ROADMAP_LANES.has(card.lane)
          ? card.lane
          : "next",
      title:
        typeof card?.title === "string" && card.title.trim()
          ? card.title.trim()
          : `Roadmap item ${index + 1}`,
      description: typeof card?.description === "string" ? card.description : "",
      tags: toStringArray(card?.tags),
      linkedRepo: typeof card?.linkedRepo === "string" && card.linkedRepo ? card.linkedRepo : null,
      dueDate: typeof card?.dueDate === "string" && card.dueDate ? card.dueDate : null,
      project: mapProjectRef(card?.project) ?? null,
      createdAt: cardCreatedAt,
      updatedAt: cardUpdatedAt
    };
  });

  const migratedJournalEntries = (Array.isArray(state?.journalEntries) ? state.journalEntries : []).map(
    (entry: any, index: number) => {
      const createdAt = toIso(entry?.createdAt ?? entry?.ts ?? entry?.updatedAt, now);
      const updatedAt = toIso(entry?.updatedAt ?? entry?.ts ?? createdAt, createdAt);

      return {
        id:
          typeof entry?.id === "string" && entry.id
            ? entry.id
            : fallbackId("journal", index),
        projectId: mapProjectRef(entry?.projectId ?? entry?.project) ?? null,
        ts: toIso(entry?.ts ?? createdAt, createdAt),
        type:
          typeof entry?.type === "string" && VALID_JOURNAL_TYPES.has(entry.type)
            ? entry.type
            : "note",
        title:
          typeof entry?.title === "string" && entry.title.trim()
            ? entry.title.trim()
            : null,
        body:
          typeof entry?.body === "string"
            ? entry.body
            : typeof entry?.text === "string"
            ? entry.text
            : "",
        links: {
          taskIds: toStringArray(entry?.links?.taskIds ?? entry?.taskIds),
          roadmapCardIds: toStringArray(entry?.links?.roadmapCardIds ?? entry?.roadmapCardIds),
          repoIds: toStringArray(entry?.links?.repoIds ?? entry?.repoIds),
          commitShas: toStringArray(entry?.links?.commitShas ?? entry?.commitShas)
        },
        tags: toStringArray(entry?.tags),
        createdAt,
        updatedAt
      };
    }
  );

  const migratedWeeklyReviews = (Array.isArray(state?.weeklyReviews) ? state.weeklyReviews : []).map(
    (review: any, index: number) => {
      const weekStart =
        typeof review?.weekStart === "string" && review.weekStart
          ? review.weekStart.slice(0, 10)
          : toIso(review?.createdAt ?? review?.closedAt, now).slice(0, 10);
      const weekEnd =
        typeof review?.weekEnd === "string" && review.weekEnd
          ? review.weekEnd.slice(0, 10)
          : addDays(weekStart, 6);
      const createdAt = toIso(review?.createdAt ?? review?.closedAt, now);

      return {
        id:
          typeof review?.id === "string" && review.id
            ? review.id
            : fallbackId("weekly-review", index),
        weekStart,
        weekEnd,
        stats: {
          goalsCompleted: toFiniteNumber(review?.stats?.goalsCompleted, 0),
          points: toFiniteNumber(review?.stats?.points, 0),
          tasksDone: toFiniteNumber(review?.stats?.tasksDone, 0),
          tasksCreated: toFiniteNumber(review?.stats?.tasksCreated, 0),
          roadmapMoved: toFiniteNumber(review?.stats?.roadmapMoved, 0),
          commitsCount: toFiniteNumber(review?.stats?.commitsCount, 0),
          focusMinutes: toFiniteNumber(review?.stats?.focusMinutes, 0),
          journalCount: toFiniteNumber(review?.stats?.journalCount, 0),
          streakDelta: toFiniteNumber(review?.stats?.streakDelta, 0)
        },
        perProject: Array.isArray(review?.perProject)
          ? review.perProject.map((item: any, itemIndex: number) => {
              const projectId = mapProjectRef(item?.projectId ?? item?.project ?? item?.projectName) ?? "";
              const projectName =
                typeof item?.projectName === "string" && item.projectName
                  ? item.projectName
                  : projects.find((project) => project.id === projectId)?.name ?? `Project ${itemIndex + 1}`;

              return {
                projectId,
                projectName,
                tasksDone: toFiniteNumber(item?.tasksDone, 0),
                tasksCreated: toFiniteNumber(item?.tasksCreated, 0),
                commitsCount: toFiniteNumber(item?.commitsCount, 0),
                focusMinutes: toFiniteNumber(item?.focusMinutes, 0),
                journalCount: toFiniteNumber(item?.journalCount, 0),
                roadmapMoved: toFiniteNumber(item?.roadmapMoved, 0)
              };
            })
          : [],
        highlights: toStringArray(review?.highlights),
        markdown:
          typeof review?.markdown === "string" && review.markdown
            ? review.markdown
            : `# Weekly Review (${weekStart} → ${weekEnd})`,
        createdAt,
        closedAt:
          review?.closedAt == null
            ? null
            : toIso(review.closedAt, createdAt)
      };
    }
  );

  const migratedWeeklySnapshots = (Array.isArray(state?.weeklySnapshots) ? state.weeklySnapshots : []).map(
    (snapshot: any, index: number) => {
      const weekStart =
        typeof snapshot?.weekStart === "string" && snapshot.weekStart
          ? snapshot.weekStart.slice(0, 10)
          : typeof snapshot?.data?.review?.weekStart === "string"
          ? snapshot.data.review.weekStart.slice(0, 10)
          : toIso(snapshot?.createdAt, now).slice(0, 10);
      const weekEnd =
        typeof snapshot?.weekEnd === "string" && snapshot.weekEnd
          ? snapshot.weekEnd.slice(0, 10)
          : typeof snapshot?.data?.review?.weekEnd === "string"
          ? snapshot.data.review.weekEnd.slice(0, 10)
          : addDays(weekStart, 6);

      return {
        id:
          typeof snapshot?.id === "string" && snapshot.id
            ? snapshot.id
            : fallbackId("weekly-snapshot", index),
        weekStart,
        weekEnd,
        data:
          snapshot?.data && typeof snapshot.data === "object" && !Array.isArray(snapshot.data)
            ? snapshot.data
            : {}
      };
    }
  );

  const migratedQuickCaptures = (Array.isArray(state?.quickCaptures) ? state.quickCaptures : []).map(
    (capture: any, index: number) => ({
      id:
        typeof capture?.id === "string" && capture.id
          ? capture.id
          : fallbackId("quick-capture", index),
      type:
        typeof capture?.type === "string" && VALID_QUICK_CAPTURE_TYPES.has(capture.type)
          ? capture.type
          : "note",
      text: typeof capture?.text === "string" ? capture.text : "",
      createdAt: toIso(capture?.createdAt, now)
    })
  );

  const migrated = {
    ...state,
    metadata: {
      ...(state?.metadata ?? {}),
      schema_version: SCHEMA_VERSION,
      created_at: toIso(state?.metadata?.created_at, now)
    },
    userSettings: {
      ...(state?.userSettings ?? {}),
      schemaVersion: SCHEMA_VERSION
    },
    projects,
    roadmapCards: migratedRoadmap,
    journalEntries: migratedJournalEntries,
    weeklyReviews: migratedWeeklyReviews,
    weeklySnapshots: migratedWeeklySnapshots,
    quickCaptures: migratedQuickCaptures
  };

  return AppStateSchema.parse(migrated);
}

export function migrateV1ToV2(state: any): AppState {
  return migrateStateToCurrent(state);
}

export function migrateV2ToV3(state: any): AppState {
  return migrateStateToCurrent(state);
}

export function applyMigrations(bundle: any): ExportBundle {
  const parsed = ExportBundleSchema.safeParse(bundle);
  if (parsed.success && parsed.data.schema_version === SCHEMA_VERSION) {
    return parsed.data;
  }

  const schemaVersion = bundle?.schema_version ?? 1;
  const data = bundle?.data ?? {};

  if (schemaVersion === 1) {
    return {
      schema_version: SCHEMA_VERSION,
      created_at: bundle?.created_at ?? new Date().toISOString(),
      data: migrateV1ToV2(data)
    };
  }

  if (schemaVersion === 2) {
    return {
      schema_version: SCHEMA_VERSION,
      created_at: bundle?.created_at ?? new Date().toISOString(),
      data: migrateV2ToV3(data)
    };
  }

  return {
    schema_version: SCHEMA_VERSION,
    created_at: bundle?.created_at ?? new Date().toISOString(),
    data: migrateStateToCurrent(data)
  };
}
