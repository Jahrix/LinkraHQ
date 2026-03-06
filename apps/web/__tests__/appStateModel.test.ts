import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type AppState } from "@linkra/shared";
import {
  applyImportBundle,
  cloneAppState,
  createDefaultAppState,
  createExportBundle,
  createWipedAppState
} from "../src/lib/appStateModel";

const createState = (): AppState => {
  const state = createDefaultAppState("2026-03-06T10:00:00.000Z");
  state.github = {
    loggedIn: true,
    user: {
      login: "boon",
      avatarUrl: null,
      name: "Boon"
    },
    lastSyncAt: "2026-03-06T10:00:00.000Z",
    rateLimit: null
  };
  state.projects = [
    {
      id: "p1",
      name: "Alpha",
      subtitle: "Frontend",
      icon: "🚀",
      color: "#5DD8FF",
      status: "In Progress",
      progress: 25,
      weeklyHours: 8,
      githubRepo: "acme/alpha",
      remoteRepo: "acme/alpha",
      localRepoPath: "/repos/alpha",
      healthScore: null,
      archivedAt: null,
      createdAt: "2026-03-05T08:00:00.000Z",
      updatedAt: "2026-03-06T08:00:00.000Z",
      tasks: []
    }
  ];
  return state;
};

describe("app state model", () => {
  it("creates export bundles from the canonical frontend state", () => {
    const state = createState();

    const bundle = createExportBundle(state, "2026-03-06T12:00:00.000Z");

    expect(bundle.schema_version).toBe(SCHEMA_VERSION);
    expect(bundle.created_at).toBe("2026-03-06T12:00:00.000Z");
    expect(bundle.data.projects[0]?.id).toBe("p1");
    expect(bundle.data).not.toBe(state);
  });

  it("merges imported data without overwriting local records in merge_keep mode", () => {
    const current = createState();
    const incoming = cloneAppState(current);
    incoming.projects[0] = {
      ...incoming.projects[0],
      name: "Imported Alpha",
      weeklyHours: 12
    };
    incoming.userSettings.repoWatchDirs = ["/repos"];

    const merged = applyImportBundle(current, createExportBundle(incoming), "merge_keep");

    expect(merged.projects[0]?.name).toBe("Alpha");
    expect(merged.projects[0]?.weeklyHours).toBe(8);
    expect(merged.userSettings.repoWatchDirs).toEqual(["/repos"]);
  });

  it("overwrites conflicting records in merge_overwrite mode", () => {
    const current = createState();
    const incoming = cloneAppState(current);
    incoming.projects[0] = {
      ...incoming.projects[0],
      name: "Imported Alpha",
      weeklyHours: 12
    };

    const merged = applyImportBundle(current, createExportBundle(incoming), "merge_overwrite");

    expect(merged.projects[0]?.name).toBe("Imported Alpha");
    expect(merged.projects[0]?.weeklyHours).toBe(12);
  });

  it("wipes user data but preserves the current auth-linked github context", () => {
    const state = createState();
    state.localRepos = [
      {
        id: "repo-1",
        name: "alpha",
        path: "/repos/alpha",
        watchDir: "/repos",
        remoteUrl: null,
        defaultBranch: "main",
        lastCommitAt: null,
        lastCommitMessage: null,
        lastCommitAuthor: null,
        dirty: false,
        untrackedCount: 0,
        ahead: 0,
        behind: 0,
        todayCommitCount: 3,
        lastHeadSha: null,
        lastStatusHash: null,
        lastScanDurationMs: 120,
        scanError: null,
        scannedAt: "2026-03-06T09:00:00.000Z"
      }
    ];

    const wiped = createWipedAppState(state);

    expect(wiped.projects).toEqual([]);
    expect(wiped.localRepos).toEqual([]);
    expect(wiped.github).toEqual(state.github);
    expect(wiped.metadata.schema_version).toBe(SCHEMA_VERSION);
  });
});
