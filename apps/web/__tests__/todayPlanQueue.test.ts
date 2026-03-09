import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TodayPlanQueue from "../src/components/TodayPlanQueue";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TodayPlanQueue", () => {
  it("renders manual queue controls when not reviewing an AI preview", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const markup = renderToStaticMarkup(
      React.createElement(TodayPlanQueue, {
        planDraft: [],
        allTaskLookup: new Map(),
        onBuildPlan: async () => null,
        onSave: () => undefined,
        onRemove: () => undefined,
        onStartFocus: () => undefined,
        availableTaskOptions: [{ value: "task-1", label: "Project Alpha - First task" }],
        onAddTask: () => undefined,
        remainingBuilds: 3,
        dailyLimit: 5,
        isAdmin: false
      })
    );

    expect(markup).toContain("Add Task To Queue");
    expect(markup).toContain("Add to Queue");
  });
});
