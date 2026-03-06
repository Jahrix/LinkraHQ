import React, { useState } from "react";
import { todayKey, computeGoalMetrics, type RoadmapCard } from "@linkra/shared";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import Select from "./Select";

export default function QuickCapture() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [type, setType] = useState<"note" | "task" | "roadmap" | "journal">("note");
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [journalType, setJournalType] = useState<"note" | "decision" | "blocker" | "next" | "idea">("note");

  if (!state) return null;

  const handleCapture = async () => {
    if (!text.trim()) return;
    const now = new Date().toISOString();
    const next = cloneAppState(state);

    next.quickCaptures = [
      { id: crypto.randomUUID(), type, text: text.trim(), createdAt: now },
      ...next.quickCaptures
    ];

    if (type === "task") {
      const activeProject =
        next.projects.find((project) => project.id === projectId && project.status !== "Archived") ??
        next.projects.find((project) => project.status !== "Archived");

      if (activeProject) {
        activeProject.tasks.unshift({
          id: crypto.randomUUID(),
          text: text.trim(),
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
        activeProject.updatedAt = now;
      } else {
        const key = todayKey();
        const entry = next.dailyGoalsByDate[key];
        if (entry) {
          entry.goals = [
            {
              id: crypto.randomUUID(),
              title: text.trim(),
              category: "Quick",
              points: 1,
              done: false,
              createdAt: now,
              completedAt: null
            },
            ...entry.goals
          ];
          const metrics = computeGoalMetrics(entry.goals);
          entry.completedPoints = metrics.completedPoints;
          entry.score = metrics.score;
        }
      }
    }

    if (type === "roadmap") {
      const card: RoadmapCard = {
        id: crypto.randomUUID(),
        lane: "now",
        title: text.trim(),
        description: "",
        tags: [],
        linkedRepo: null,
        dueDate: null,
        project: projectId || null,
        createdAt: now,
        updatedAt: now
      };
      next.roadmapCards = [card, ...next.roadmapCards];
    }

    if (type === "journal") {
      next.journalEntries = [
        {
          id: crypto.randomUUID(),
          projectId: projectId || null,
          ts: now,
          type: journalType,
          title: null,
          body: text.trim(),
          links: {
            taskIds: [],
            roadmapCardIds: [],
            repoIds: [],
            commitShas: []
          },
          tags: [],
          createdAt: now,
          updatedAt: now
        },
        ...next.journalEntries
      ];
    }

    setText("");
    await save(next);
    push("Captured.");
  };

  return (
    <div className="panel p-4 pb-3 flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">Quick Capture</h3>
        <span className="text-[10px] font-medium text-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/5">Instant</span>
      </div>
      <div className="flex flex-col md:flex-row gap-2 items-start">
        <Select
          className="w-full md:w-[130px] flex-shrink-0"
          value={type}
          onChange={(val) => setType(val as any)}
          options={[
            { value: "note", label: "Note" },
            { value: "task", label: "Task" },
            { value: "roadmap", label: "Roadmap" },
            { value: "journal", label: "Journal" }
          ]}
        />
        <Select
          className="w-full md:w-[160px] flex-shrink-0"
          value={projectId}
          onChange={(val) => setProjectId(val)}
          options={[
            { value: "", label: "No project" },
            ...state.projects
              .filter((project) => project.status !== "Archived")
              .map((project) => ({ value: project.id, label: project.name }))
          ]}
        />
        <input
          className="input flex-1 min-w-0"
          placeholder="Capture a thought, task, or roadmap card..."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="button-primary" onClick={handleCapture}>
          Add
        </button>
      </div>
      {type === "journal" && (
        <div className="grid gap-2 md:grid-cols-[200px_1fr]">
          <Select
            value={journalType}
            onChange={(val) => setJournalType(val as any)}
            options={[
              { value: "note", label: "Note" },
              { value: "decision", label: "Decision" },
              { value: "blocker", label: "Blocker" },
              { value: "next", label: "Next" },
              { value: "idea", label: "Idea" }
            ]}
          />
          <p className="text-xs text-muted self-center">Journal capture type</p>
        </div>
      )}
    </div>
  );
}
