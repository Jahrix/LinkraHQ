import React, { useState } from "react";
import { todayKey, computeGoalMetrics, type RoadmapCard } from "@linkra/shared";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";

export default function QuickCapture() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [type, setType] = useState<"note" | "task" | "roadmap">("note");
  const [text, setText] = useState("");

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

    if (type === "roadmap") {
      const card: RoadmapCard = {
        id: crypto.randomUUID(),
        lane: "now",
        title: text.trim(),
        description: "",
        tags: [],
        linkedRepo: null,
        dueDate: null,
        project: null,
        createdAt: now,
        updatedAt: now
      };
      next.roadmapCards = [card, ...next.roadmapCards];
    }

    setText("");
    await save(next);
    push("Captured.");
  };

  return (
    <div className="glass panel" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Quick Capture</h3>
        <span className="badge">Instant</span>
      </div>
      <div className="filter-row">
        <select value={type} onChange={(event) => setType(event.target.value as any)}>
          <option value="note">Note</option>
          <option value="task">Task</option>
          <option value="roadmap">Roadmap</option>
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
    </div>
  );
}
