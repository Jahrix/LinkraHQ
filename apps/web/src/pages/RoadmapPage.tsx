import React, { useMemo, useState } from "react";
import { type RoadmapCard, type RoadmapLane } from "@linkra/shared";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import Select from "../components/Select";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";

const lanes: { key: RoadmapLane; label: string }[] = [
  { key: "now", label: "Active" },
  { key: "next", label: "Pipeline" },
  { key: "later", label: "Backlog" },
  { key: "shipped", label: "Deployed" }
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
    if (saved) {
      push("Milestone deployed to Roadmap.");
    } else {
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
    push("Link copied to clipboard.");
  };

  const activeProjects = state.projects.filter((project) => project.status !== "Archived");
  const projectNameById = new Map(state.projects.map((project) => [project.id, project.name]));

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Strategic Roadmap</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3">Plan what ships next</p>
        </div>
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-2 rounded-2xl backdrop-blur-xl">
          <input
            className="input bg-transparent border-none focus:ring-0 text-sm py-2 px-4 w-64"
            placeholder="Filter operations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="h-4 w-[1px] bg-white/10" />
          <span className="text-[10px] font-black uppercase tracking-widest px-4 text-muted/60">{filteredCards.length} Cards</span>
        </div>
      </div>

      <GlassPanel variant="standard" className="p-6">
        <SectionHeader title="Deployment Intake" subtitle="Capture upcoming project milestones" />
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <input className="input font-bold" placeholder="Milestone Title" value={title} onChange={(e) => setTitle(e.target.value)} />
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
          className="input mt-4 text-sm resize-none"
          placeholder="Detailed strategic description..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <input
            className="input flex-1 text-xs"
            placeholder="Tags (comma separated)..."
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button className="button-primary px-8 font-black uppercase tracking-widest text-[10px]" onClick={addCard}>
            Deploy Card
          </button>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 min-h-[600px]">
        {lanes.map((lane) => (
          <div
            key={lane.key}
            className="flex flex-col gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/5 shadow-inner"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, lane.key)}
          >
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-xs font-black uppercase tracking-[0.25em] text-white/40 italic">{lane.label}</h3>
              <span className="bg-white/5 text-[9px] font-black text-muted px-2 py-1 rounded-full border border-white/5">
                {filteredCards.filter((card) => card.lane === lane.key).length}
              </span>
            </div>

            <div className="flex-1 space-y-4">
              {filteredCards
                .filter((card) => card.lane === lane.key)
                .map((card) => (
                  <div
                    key={card.id}
                    className="group bg-white/5 border border-white/5 p-5 rounded-2xl hover:bg-white/[0.08] hover:border-white/20 hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] transition-all duration-300 cursor-grab active:cursor-grabbing relative overflow-hidden"
                    draggable
                    onDragStart={(event) => onDragStart(event, card.id)}
                  >
                    {card.project && (
                      <div className="mb-2">
                        <span className="text-[9px] font-black tracking-widest uppercase text-accent/60 px-2 py-0.5 rounded bg-accent/5 border border-accent/10">
                          {projectNameById.get(card.project) ?? card.project}
                        </span>
                      </div>
                    )}
                    <strong className="block text-white group-hover:text-accent transition-colors leading-tight">{card.title}</strong>
                    {card.description && <p className="mt-3 text-xs text-muted/80 leading-relaxed italic line-clamp-3">"{card.description}"</p>}

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {card.tags.map((tag) => (
                        <span key={tag} className="text-[8px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="text-[9px] font-black uppercase tracking-widest text-muted hover:text-white flex items-center gap-1.5 transition-colors" onClick={() => copyLink(card.id)}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                        Copy Asset Link
                      </button>
                    </div>
                  </div>
                ))}
              {filteredCards.filter((card) => card.lane === lane.key).length === 0 && (
                <div className="h-32 border border-dashed border-white/5 rounded-2xl flex items-center justify-center text-center p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted/20">Empty Sector</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
