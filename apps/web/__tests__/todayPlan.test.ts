import { describe, expect, it } from "vitest";
import { computeTodayPlan } from "../src/lib/taskRules";

describe("today plan generation", () => {
  it("prioritizes overdue roadmap work on heavier projects", () => {
    const plan = computeTodayPlan(
      [
        {
          projectId: "p1",
          projectName: "Project 1",
          weeklyHours: 10,
          projectTaskList: [
            {
              id: "t1",
              text: "Roadmap task",
              done: false,
              status: "todo",
              dependsOnIds: [],
              priority: "med",
              dueDate: "2026-03-01",
              milestone: null,
              createdAt: "2026-02-19T01:00:00.000Z",
              completedAt: null,
              linkedCommit: null
            }
          ],
          task: {
            id: "t1",
            text: "Roadmap task",
            done: false,
            status: "todo",
            dependsOnIds: [],
            priority: "med",
            dueDate: "2026-03-01",
            milestone: null,
            createdAt: "2026-02-19T01:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        },
        {
          projectId: "p2",
          projectName: "Project 2",
          weeklyHours: 2,
          projectTaskList: [
            {
              id: "t2",
              text: "Normal task",
              done: false,
              status: "todo",
              dependsOnIds: [],
              priority: "high",
              dueDate: null,
              milestone: null,
              createdAt: "2026-02-20T01:00:00.000Z",
              completedAt: null,
              linkedCommit: null
            }
          ],
          task: {
            id: "t2",
            text: "Normal task",
            done: false,
            status: "todo",
            dependsOnIds: [],
            priority: "high",
            dueDate: null,
            milestone: null,
            createdAt: "2026-02-20T01:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        }
      ],
      {
        boostProjectIds: ["p1"],
        roadmapNowProjectIds: ["p1"],
        roadmapNowTaskIds: ["t1"],
        maxTasks: 5
      }
    );

    expect(plan[0]).toBe("t1");
    expect(plan).toContain("t2");
  });

  it("uses insight boosts and penalizes blocked tasks", () => {
    const plan = computeTodayPlan(
      [
        {
          projectId: "p1",
          projectName: "Project 1",
          weeklyHours: 6,
          projectTaskList: [
            {
              id: "blocked-source",
              text: "Upstream dependency",
              done: false,
              status: "todo",
              dependsOnIds: [],
              priority: "low",
              dueDate: null,
              milestone: null,
              createdAt: "2026-02-20T01:00:00.000Z",
              completedAt: null,
              linkedCommit: null
            },
            {
              id: "blocked",
              text: "Blocked task",
              done: false,
              status: "todo",
              dependsOnIds: ["blocked-source"],
              priority: "high",
              dueDate: null,
              milestone: null,
              createdAt: "2026-02-20T01:00:00.000Z",
              completedAt: null,
              linkedCommit: null
            }
          ],
          task: {
            id: "blocked",
            text: "Blocked task",
            done: false,
            status: "todo",
            dependsOnIds: ["blocked-source"],
            priority: "high",
            dueDate: null,
            milestone: null,
            createdAt: "2026-02-20T01:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        },
        {
          projectId: "p2",
          projectName: "Project 2",
          weeklyHours: 4,
          projectTaskList: [
            {
              id: "insight-task",
              text: "Follow up on insight",
              done: false,
              status: "todo",
              dependsOnIds: [],
              priority: "med",
              dueDate: null,
              milestone: null,
              createdAt: "2026-02-22T01:00:00.000Z",
              completedAt: null,
              linkedCommit: null
            }
          ],
          task: {
            id: "insight-task",
            text: "Follow up on insight",
            done: false,
            status: "todo",
            dependsOnIds: [],
            priority: "med",
            dueDate: null,
            milestone: null,
            createdAt: "2026-02-22T01:00:00.000Z",
            completedAt: null,
            linkedCommit: null
          }
        }
      ],
      {
        insightProjectIds: ["p2"],
        maxTasks: 4
      }
    );

    expect(plan[0]).toBe("insight-task");
    expect(plan).toContain("blocked");
  });
});
