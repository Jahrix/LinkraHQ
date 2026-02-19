import { describe, expect, it } from "vitest";
import { isTaskBlocked } from "../src/lib/taskRules";

describe("task dependencies", () => {
  it("blocks task when dependency not done", () => {
    const tasks: any[] = [
      { id: "a", done: false, dependsOnIds: [] },
      { id: "b", done: false, dependsOnIds: ["a"] }
    ];
    expect(isTaskBlocked(tasks[1], tasks)).toBe(true);
  });
});
