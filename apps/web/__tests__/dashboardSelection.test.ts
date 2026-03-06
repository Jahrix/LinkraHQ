import { describe, expect, it } from "vitest";
import type { Project } from "@linkra/shared";
import { resolveProjectSelection } from "../src/lib/dashboardSelection";

const createProject = (id: string, name: string): Project => ({
  id,
  name,
  subtitle: `${name} subtitle`,
  icon: "🧩",
  color: "#5DD8FF",
  status: "In Progress",
  progress: 0,
  weeklyHours: 4,
  githubRepo: null,
  remoteRepo: null,
  localRepoPath: null,
  healthScore: null,
  archivedAt: null,
  createdAt: "2026-03-06T10:00:00.000Z",
  updatedAt: "2026-03-06T10:00:00.000Z",
  tasks: []
});

describe("dashboard selection", () => {
  it("targets the selected project by id even if the list order changes", () => {
    const projects = [createProject("p2", "Bravo"), createProject("p1", "Alpha")];

    const selection = resolveProjectSelection(projects, "p1");

    expect(selection.selectedProjectId).toBe("p1");
    expect(selection.selectedProject?.name).toBe("Alpha");
  });

  it("honors a forced project route when that project is visible", () => {
    const projects = [createProject("p1", "Alpha"), createProject("p2", "Bravo")];

    const selection = resolveProjectSelection(projects, "p1", "p2");

    expect(selection.selectedProjectId).toBe("p2");
    expect(selection.selectedProject?.name).toBe("Bravo");
  });

  it("falls back to the first visible project when the selected id no longer exists", () => {
    const projects = [createProject("p3", "Charlie"), createProject("p4", "Delta")];

    const selection = resolveProjectSelection(projects, "missing");

    expect(selection.selectedProjectId).toBe("p3");
    expect(selection.selectedProject?.name).toBe("Charlie");
  });
});
