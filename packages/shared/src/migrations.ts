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

function toIso(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value) return fallback;
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? fallback : asDate.toISOString();
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

  const projects = rawProjects.map((project: any) => {
    const status = toProjectStatus(project?.status);
    const createdAt = toIso(project?.createdAt, state?.metadata?.created_at ?? now);
    const updatedAt = toIso(project?.updatedAt, now);
    const archivedAt =
      status === "Archived"
        ? toIso(project?.archivedAt, updatedAt)
        : null;

    const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
    const migratedTasks = tasks.map((task: any) => {
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
      return {
        ...task,
        done,
        status: statusValue,
        dependsOnIds: Array.isArray(task?.dependsOnIds) ? task.dependsOnIds : [],
        priority: task?.priority === "low" || task?.priority === "high" ? task.priority : "med",
        linkedCommit: task?.linkedCommit ?? null
      };
    });

    return {
      ...project,
      status,
      archivedAt,
      createdAt,
      updatedAt,
      remoteRepo: project?.remoteRepo ?? project?.githubRepo ?? null,
      localRepoPath: project?.localRepoPath ?? null,
      healthScore: project?.healthScore ?? null,
      tasks: migratedTasks
    };
  });

  const projectNameToId = new Map(
    projects
      .map((project: any) => [project?.name, project?.id] as const)
      .filter((entry: readonly [unknown, unknown]): entry is readonly [string, string] => {
        const [name, id] = entry;
        return typeof name === "string" && typeof id === "string";
      })
  );

  const migratedRoadmap = (Array.isArray(state?.roadmapCards) ? state.roadmapCards : []).map((card: any) => {
    const projectRef = card?.project;
    const mappedProjectId =
      typeof projectRef === "string" && projectNameToId.has(projectRef)
        ? projectNameToId.get(projectRef)
        : projectRef ?? null;

    return {
      ...card,
      project: mappedProjectId ?? null
    };
  });

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
    roadmapCards: migratedRoadmap
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
