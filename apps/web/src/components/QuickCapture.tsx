import React, { useState } from "react";
import { todayKey, computeGoalMetrics, type RoadmapCard } from "@linkra/shared";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";

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
    const next = { ...state };

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
    <div className="panel space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Quick Capture</p>
          <h3 className="text-base font-semibold">Instant capture</h3>
        </div>
        <span className="badge">Instant</span>
      </div>
      <div className="grid gap-2 md:grid-cols-[150px_190px_1fr_auto]">
        <select className="input" value={type} onChange={(event) => setType(event.target.value as any)}>
          <option value="note">Note</option>
          <option value="task">Task</option>
          <option value="roadmap">Roadmap</option>
          <option value="journal">Journal</option>
        </select>
        <select className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">No project</option>
          {state.projects
            .filter((project) => project.status !== "Archived")
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
        <input
          className="input"
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
          <select className="input" value={journalType} onChange={(event) => setJournalType(event.target.value as any)}>
            <option value="note">Note</option>
            <option value="decision">Decision</option>
            <option value="blocker">Blocker</option>
            <option value="next">Next</option>
            <option value="idea">Idea</option>
          </select>
          <p className="text-xs text-white/50 self-center">Journal capture type</p>
        </div>
      )}
    </div>
  );
}
