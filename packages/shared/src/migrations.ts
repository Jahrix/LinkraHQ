import { AppStateSchema, ExportBundleSchema, SCHEMA_VERSION, type AppState, type ExportBundle } from "./schema.js";

export function migrateV1ToV2(state: any): AppState {
  const next = {
    ...state,
    metadata: {
      ...(state.metadata ?? {}),
      schema_version: SCHEMA_VERSION
    },
    userSettings: {
      ...(state.userSettings ?? {}),
      schemaVersion: SCHEMA_VERSION
    }
  };
  const parsed = AppStateSchema.parse(next);
  parsed.projects.forEach((project) => {
    project.tasks.forEach((task) => {
      if (task.done && task.status !== "done") {
        task.status = "done";
      }
      if (!task.done && task.status === "done") {
        task.status = "todo";
      }
    });
  });
  return parsed;
}

export function applyMigrations(bundle: any): ExportBundle {
  const parsed = ExportBundleSchema.safeParse(bundle);
  if (parsed.success) {
    if (parsed.data.schema_version === SCHEMA_VERSION) return parsed.data;
    if (parsed.data.schema_version === 1) {
      return {
        schema_version: SCHEMA_VERSION,
        created_at: parsed.data.created_at,
        data: migrateV1ToV2(parsed.data.data)
      };
    }
  }

  const schemaVersion = bundle?.schema_version ?? 1;
  if (schemaVersion === 1 && bundle?.data) {
    return {
      schema_version: SCHEMA_VERSION,
      created_at: bundle.created_at ?? new Date().toISOString(),
      data: migrateV1ToV2(bundle.data)
    };
  }
  return {
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    data: migrateV1ToV2(bundle?.data ?? {})
  };
}
