import { describe, expect, it } from "vitest";
import { computeTodayPlan } from "../src/lib/taskRules";

describe("today plan generation", () => {
  it("prioritizes high-priority and boosted project tasks", () => {
    const plan = computeTodayPlan(
      [
        {
          projectId: "p1",
          projectName: "Project 1",
          weeklyHours: 8,
          task: {
            id: "t1",
            text: "High priority task",
            done: false,
            status: "todo",
            dependsOnIds: [],
            priority: "high",
            dueDate: null,
            milestone: null,
            createdAt: "2026-02-19T01:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        },
        {
          projectId: "p2",
          projectName: "Project 2",
          weeklyHours: 1,
          task: {
            id: "t2",
            text: "Normal task",
            done: false,
            status: "todo",
            dependsOnIds: [],
            priority: "med",
            dueDate: null,
            milestone: null,
            createdAt: "2026-02-19T01:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        }
      ],
      { boostProjectIds: ["p1"] }
    );

    expect(plan[0]).toBe("t1");
    expect(plan).toContain("t2");
  });
});
