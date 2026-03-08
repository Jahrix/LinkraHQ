import React, { useMemo, useState } from "react";
import { type RoadmapCard, type RoadmapLane } from "@linkra/shared";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import Select from "../components/Select";

const lanes: { key: RoadmapLane; label: string }[] = [
  { key: "now", label: "Now" },
  { key: "next", label: "Next" },
  { key: "later", label: "Later" },
  { key: "shipped", label: "Shipped" }
];

export default function RoadmapPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState("");

  if (!state) return null;

  const filteredCards = useMemo(() => {
    const lower = query.toLowerCase();
    return state.roadmapCards.filter((card) => {
      if (!lower) return true;
      return (
        card.title.toLowerCase().includes(lower) ||
        card.description.toLowerCase().includes(lower) ||
        card.tags.some((tag) => tag.toLowerCase().includes(lower))
      );
    });
  }, [state.roadmapCards, query]);

  const addCard = async () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const card: RoadmapCard = {
      id: crypto.randomUUID(),
      lane: "now",
      title: title.trim(),
      description: description.trim(),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      linkedRepo: null,
      dueDate: null,
      project: projectId || null,
      createdAt: now,
      updatedAt: now
    };
    const next = cloneAppState(state);
    next.roadmapCards = [card, ...next.roadmapCards];
    setTitle("");
    setDescription("");
    setTags("");
    setProjectId("");
    const saved = await save(next);
    if (!saved) {
      push("Failed to add card.", "error");
    }
  };

  const onDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData("text/plain", id);
  };

  const onDrop = async (event: React.DragEvent, lane: RoadmapLane) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const next = cloneAppState(state);
    next.roadmapCards = next.roadmapCards.map((card) =>
      card.id === id
        ? {
          ...card,
          lane,
          updatedAt: new Date().toISOString()
        }
        : card
    );
    const saved = await save(next);
    if (!saved) {
      push("Failed to move card.", "error");
    }
  };

  const copyLink = async (cardId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/roadmap?card=${cardId}`;
    await navigator.clipboard.writeText(url);
  };

  const activeProjects = state.projects.filter((project) => project.status !== "Archived");
  const projectNameById = new Map(state.projects.map((project) => [project.id, project.name]));

  return (
    <div className="space-y-6">
      <div className="panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Roadmap</p>
          <h2 className="text-lg font-semibold">Plan what ships next</h2>
        </div>
        <div className="flex flex-1 items-center gap-2 md:justify-end">
          <input
            className="input max-w-xs"
            placeholder="Search roadmap..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="chip">{filteredCards.length} cards</span>
        </div>
      </div>

      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">New Card</p>
          <h3 className="text-base font-semibold">Capture an idea</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select
            className="w-full"
            value={projectId}
            onChange={(val) => setProjectId(val)}
            options={[
              { value: "", label: "No linked project" },
              ...activeProjects.map((project) => ({ value: project.id, label: project.name }))
            ]}
          />
        </div>
        <textarea
          className="input"
          placeholder="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button className="button-primary" onClick={addCard}>
            Add Card
          </button>
        </div>
      </div>

      <div className="kanban">
        {lanes.map((lane) => (
          <div
            key={lane.key}
            className="kanban-column glass"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, lane.key)}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{lane.label}</h3>
              <span className="chip">
                {filteredCards.filter((card) => card.lane === lane.key).length}
              </span>
            </div>
            {filteredCards
              .filter((card) => card.lane === lane.key)
              .map((card) => (
                <div
                  key={card.id}
                  className="kanban-card hover-lift"
                  draggable
                  onDragStart={(event) => onDragStart(event, card.id)}
                >
                  <strong>{card.title}</strong>
                  {card.description && <p className="mt-2 text-xs text-muted">{card.description}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button className="button-secondary" onClick={() => copyLink(card.id)}>
                      Copy Link
                    </button>
                    {card.project && (
                      <span className="tag">{projectNameById.get(card.project) ?? card.project}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
