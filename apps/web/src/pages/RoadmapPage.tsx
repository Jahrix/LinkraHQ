import React, { useMemo, useState } from "react";
import { type RoadmapCard, type RoadmapLane } from "@linkra/shared";
import { useAppState } from "../lib/state";

const lanes: { key: RoadmapLane; label: string }[] = [
  { key: "now", label: "Now" },
  { key: "next", label: "Next" },
  { key: "later", label: "Later" },
  { key: "shipped", label: "Shipped" }
];

export default function RoadmapPage() {
  const { state, save } = useAppState();
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [project, setProject] = useState("");

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
      project: project.trim() || null,
      createdAt: now,
      updatedAt: now
    };
    const next = { ...state, roadmapCards: [card, ...state.roadmapCards] };
    setTitle("");
    setDescription("");
    setTags("");
    setProject("");
    await save(next);
  };

  const onDragStart = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData("text/plain", id);
  };

  const onDrop = async (event: React.DragEvent, lane: RoadmapLane) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const next = { ...state };
    next.roadmapCards = next.roadmapCards.map((card) =>
      card.id === id
        ? {
            ...card,
            lane,
            updatedAt: new Date().toISOString()
          }
        : card
    );
    await save(next);
  };

  const copyLink = async (cardId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/roadmap?card=${cardId}`;
    await navigator.clipboard.writeText(url);
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="glass panel">
        <div className="filter-row">
          <input className="input" placeholder="Search roadmap..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="chip">{filteredCards.length} cards</span>
        </div>
      </div>

      <div className="glass panel" style={{ display: "grid", gap: 12 }}>
        <h3>New Card</h3>
        <div className="input-inline">
          <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Project" value={project} onChange={(e) => setProject(e.target.value)} />
        </div>
        <textarea
          className="input"
          placeholder="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="input-inline">
          <input className="input" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
          <button className="button-primary" onClick={addCard}>
            Add Card
          </button>
        </div>
      </div>

      <div className="kanban">
        {lanes.map((lane) => (
          <div
            key={lane.key}
            className="kanban-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, lane.key)}
          >
            <h3>{lane.label}</h3>
            {filteredCards
              .filter((card) => card.lane === lane.key)
              .map((card) => (
                <div
                  key={card.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(event) => onDragStart(event, card.id)}
                >
                  <strong>{card.title}</strong>
                  {card.description && <p style={{ marginTop: 6, color: "var(--muted)" }}>{card.description}</p>}
                  <button
                    className="button-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => copyLink(card.id)}
                  >
                    Copy Link
                  </button>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {card.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                    {card.project && <span className="tag">{card.project}</span>}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
