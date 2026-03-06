import React, { useMemo, useState } from "react";
import type { JournalEntry, LocalRepo, Project, ProjectTask, RoadmapCard } from "@linkra/shared";
import { formatDate } from "../lib/date";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { dedupeById } from "../lib/collections";
import Modal from "./Modal";
import Pill from "./Pill";
import Select from "./Select";

type CommitOption = {
  sha: string;
  shortSha: string;
  message: string;
};

type JournalDraft = {
  type: "note" | "decision" | "blocker" | "next" | "idea";
  title: string;
  body: string;
  tags: string;
  taskIds: string[];
  roadmapCardIds: string[];
  selectedCommitShas: string[];
  manualCommitShas: string;
};

const emptyJournalDraft: JournalDraft = {
  type: "note",
  title: "",
  body: "",
  tags: "",
  taskIds: [],
  roadmapCardIds: [],
  selectedCommitShas: [],
  manualCommitShas: ""
};

export default function ProjectJournalPanel({
  project,
  tasks,
  roadmapCards,
  journalEntries,
  repo,
  commitOptions
}: {
  project: Project;
  tasks: ProjectTask[];
  roadmapCards: RoadmapCard[];
  journalEntries: JournalEntry[];
  repo: LocalRepo | null;
  commitOptions: CommitOption[];
}) {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | JournalEntry["type"]>("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JournalDraft>(emptyJournalDraft);

  if (!state) return null;

  const dedupedEntries = useMemo(
    () => dedupeById(journalEntries.filter((entry) => entry.projectId === project.id)),
    [journalEntries, project.id]
  );

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const roadmapMap = useMemo(() => new Map(roadmapCards.map((card) => [card.id, card])), [roadmapCards]);

  const availableCommitOptions = useMemo(() => {
    const map = new Map<string, CommitOption>();

    for (const option of commitOptions) {
      if (!option.sha) continue;
      map.set(option.sha, option);
    }

    for (const task of tasks) {
      if (!task.linkedCommit?.sha) continue;
      map.set(task.linkedCommit.sha, {
        sha: task.linkedCommit.sha,
        shortSha: task.linkedCommit.shortSha,
        message: task.linkedCommit.message
      });
    }

    for (const entry of dedupedEntries.items) {
      for (const sha of entry.links.commitShas ?? []) {
        if (!map.has(sha)) {
          map.set(sha, {
            sha,
            shortSha: sha.slice(0, 7),
            message: "Linked manually"
          });
        }
      }
    }

    return Array.from(map.values()).slice(0, 24);
  }, [commitOptions, dedupedEntries.items, tasks]);

  const visibleEntries = useMemo(() => {
    return dedupedEntries.items
      .filter((entry) => (typeFilter === "all" ? true : entry.type === typeFilter))
      .filter((entry) => {
        const loweredQuery = query.trim().toLowerCase();
        if (!loweredQuery) return true;
        const searchable = `${entry.type} ${entry.title ?? ""} ${entry.body} ${(entry.tags ?? []).join(" ")}`.toLowerCase();
        return searchable.includes(loweredQuery);
      })
      .sort((a, b) => (a.ts < b.ts ? 1 : -1));
  }, [dedupedEntries.items, query, typeFilter]);

  const typeCounts = useMemo(() => {
    return dedupedEntries.items.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.type] = (acc[entry.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [dedupedEntries.items]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyJournalDraft);
    setOpen(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    const selected = entry.links.commitShas.filter((sha) =>
      availableCommitOptions.some((option) => option.sha === sha)
    );
    const manual = entry.links.commitShas.filter((sha) => !selected.includes(sha)).join(", ");

    setDraft({
      type: entry.type,
      title: entry.title ?? "",
      body: entry.body,
      tags: (entry.tags ?? []).join(", "),
      taskIds: entry.links.taskIds ?? [],
      roadmapCardIds: entry.links.roadmapCardIds ?? [],
      selectedCommitShas: selected,
      manualCommitShas: manual
    });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditingId(null);
    setDraft(emptyJournalDraft);
  };

  const saveEntry = async () => {
    if (!draft.body.trim()) {
      push("Journal body is required.", "error");
      return;
    }

    const nowIso = new Date().toISOString();
    const currentEntries = state.journalEntries ?? [];
    const existingEntry = editingId ? currentEntries.find((entry) => entry.id === editingId) : null;
    const commitShas = Array.from(
      new Set([
        ...draft.selectedCommitShas,
        ...draft.manualCommitShas
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      ])
    );

    const nextEntry: JournalEntry = {
      id: editingId ?? crypto.randomUUID(),
      projectId: project.id,
      ts: existingEntry?.ts ?? nowIso,
      type: draft.type,
      title: draft.title.trim() || null,
      body: draft.body.trim(),
      links: {
        taskIds: Array.from(new Set(draft.taskIds)),
        roadmapCardIds: Array.from(new Set(draft.roadmapCardIds)),
        repoIds: repo?.id ? [repo.id] : [],
        commitShas
      },
      tags: draft.tags
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      createdAt: existingEntry?.createdAt ?? nowIso,
      updatedAt: nowIso
    };

    const next = { ...state, journalEntries: [...currentEntries] };
    if (editingId) {
      next.journalEntries = next.journalEntries.map((entry) => (entry.id === editingId ? nextEntry : entry));
      push("Journal entry updated.", "success");
    } else {
      next.journalEntries = [nextEntry, ...next.journalEntries];
      push("Journal entry added.", "success");
    }

    await save(next);
    closeModal();
  };

  const removeEntry = async (entryId: string) => {
    const confirmed = window.confirm("Delete this journal entry?");
    if (!confirmed) return;

    const next = { ...state, journalEntries: [...(state.journalEntries ?? [])] };
    next.journalEntries = next.journalEntries.filter((entry) => entry.id !== entryId);
    await save(next);
    push("Journal entry deleted.", "success");
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-sm"
            placeholder="Search project journal..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search journal entries"
          />
          <Select
            className="w-[160px]"
            value={typeFilter}
            onChange={(val) => setTypeFilter(val as "all" | JournalEntry["type"])}
            options={[
              { value: "all", label: "All types" },
              { value: "note", label: "Note" },
              { value: "decision", label: "Decision" },
              { value: "blocker", label: "Blocker" },
              { value: "next", label: "Next" },
              { value: "idea", label: "Idea" }
            ]}
          />
        </div>
        <button className="button-primary" onClick={openCreate} aria-label="Create journal entry">
          Add Entry
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["note", "decision", "blocker", "next", "idea"] as const).map((type) => (
          <Pill key={type} tone={type === "blocker" ? "warning" : type === "decision" ? "accent" : "neutral"}>
            {type}: {typeCounts[type] ?? 0}
          </Pill>
        ))}
      </div>

      {dedupedEntries.duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          Duplicate journal IDs were found for this project. The list below shows the first copy for each ID.
        </div>
      )}

      {visibleEntries.length === 0 && (
        <p className="text-sm text-muted">No journal entries for this project yet.</p>
      )}

      <div className="grid gap-2">
        {visibleEntries.map((entry) => {
          const linkedTasks = entry.links.taskIds
            .map((id) => taskMap.get(id))
            .filter((task): task is ProjectTask => Boolean(task));
          const linkedRoadmap = entry.links.roadmapCardIds
            .map((id) => roadmapMap.get(id))
            .filter((card): card is RoadmapCard => Boolean(card));
          const missingTasks = entry.links.taskIds.length - linkedTasks.length;
          const missingRoadmap = entry.links.roadmapCardIds.length - linkedRoadmap.length;

          return (
            <div key={entry.id} className="rounded-xl border border-muted bg-subtle px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill tone={entry.type === "blocker" ? "warning" : entry.type === "decision" ? "accent" : "neutral"}>
                    {entry.type}
                  </Pill>
                  <span className="text-xs text-muted">{formatDate(entry.ts)}</span>
                </div>
                <div className="flex gap-2">
                  <button className="button-secondary" onClick={() => openEdit(entry)}>
                    Edit
                  </button>
                  <button className="button-secondary" onClick={() => removeEntry(entry.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-2 text-sm font-semibold">{entry.title || "Untitled"}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{entry.body}</p>

              {(entry.tags.length > 0 ||
                linkedTasks.length > 0 ||
                linkedRoadmap.length > 0 ||
                entry.links.commitShas.length > 0 ||
                repo?.id === entry.links.repoIds[0]) && (
                  <div className="mt-3 grid gap-2">
                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {entry.tags.map((tag) => (
                          <Pill key={`${entry.id}-${tag}`}>{tag}</Pill>
                        ))}
                      </div>
                    )}

                    {linkedTasks.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        {linkedTasks.map((task) => (
                          <Pill key={task.id}>{task.text}</Pill>
                        ))}
                      </div>
                    )}

                    {linkedRoadmap.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        {linkedRoadmap.map((card) => (
                          <Pill key={card.id}>{card.title}</Pill>
                        ))}
                      </div>
                    )}

                    {entry.links.commitShas.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        {entry.links.commitShas.map((sha) => (
                          <Pill key={`${entry.id}-${sha}`} tone="accent">
                            {sha.slice(0, 7)}
                          </Pill>
                        ))}
                      </div>
                    )}

                    {repo?.id === entry.links.repoIds[0] && (
                      <div className="text-xs text-muted">Repo linked: {repo.name}</div>
                    )}

                    {(missingTasks > 0 || missingRoadmap > 0) && (
                      <div className="text-xs text-amber-200">
                        {missingTasks > 0 ? `${missingTasks} linked task(s) missing.` : ""}
                        {missingTasks > 0 && missingRoadmap > 0 ? " " : ""}
                        {missingRoadmap > 0 ? `${missingRoadmap} linked roadmap card(s) missing.` : ""}
                      </div>
                    )}
                  </div>
                )}
            </div>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={closeModal}
        title={editingId ? "Edit Journal Entry" : "Add Journal Entry"}
        footer={
          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={closeModal}>
              Cancel
            </button>
            <button className="button-primary" onClick={saveEntry}>
              Save
            </button>
          </div>
        }
      >
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-muted">Type</span>
            <Select
              className="w-full"
              value={draft.type}
              onChange={(val) => setDraft((prev) => ({ ...prev, type: val as JournalDraft["type"] }))}
              options={[
                { value: "note", label: "Note" },
                { value: "decision", label: "Decision" },
                { value: "blocker", label: "Blocker" },
                { value: "next", label: "Next" },
                { value: "idea", label: "Idea" }
              ]}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Title</span>
            <input
              className="input"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Optional title"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Body</span>
            <textarea
              className="input"
              rows={5}
              value={draft.body}
              onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
              placeholder="Capture the note, decision, blocker, or next step..."
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Tags (comma separated)</span>
            <input
              className="input"
              value={draft.tags}
              onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="release, handoff, risky"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Link Tasks</span>
            <Select
              multiple
              className="w-full"
              value={draft.taskIds}
              onChange={(val) => setDraft((prev) => ({ ...prev, taskIds: val }))}
              options={tasks.map((task) => ({ value: task.id, label: task.text }))}
              placeholder="Select tasks..."
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Link Roadmap Cards</span>
            <Select
              multiple
              className="w-full"
              value={draft.roadmapCardIds}
              onChange={(val) => setDraft((prev) => ({ ...prev, roadmapCardIds: val }))}
              options={roadmapCards.map((card) => ({ value: card.id, label: card.title }))}
              placeholder="Select roadmap cards..."
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Pick Recent Commits</span>
            <Select
              multiple
              className="w-full"
              value={draft.selectedCommitShas}
              onChange={(val) => setDraft((prev) => ({ ...prev, selectedCommitShas: val }))}
              options={availableCommitOptions.map((commit) => ({
                value: commit.sha,
                label: `${commit.shortSha} - ${commit.message}`
              }))}
              placeholder="Select commits..."
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Manual Commit SHAs</span>
            <input
              className="input"
              value={draft.manualCommitShas}
              onChange={(event) => setDraft((prev) => ({ ...prev, manualCommitShas: event.target.value }))}
              placeholder="a1b2c3d, e4f5g6h"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
