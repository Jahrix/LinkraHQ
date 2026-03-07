import React, { useMemo, useState } from "react";
import type { LocalRepo, Project } from "@linkra/shared";
import Select from "./Select";

type ProjectStatus = Project["status"];

const EMOJI_OPTIONS = [
  { emoji: "🚀", label: "Launch", keywords: ["ship", "launch", "release"] },
  { emoji: "🛰️", label: "Ops", keywords: ["ops", "infra", "backend"] },
  { emoji: "🕹️", label: "Gaming", keywords: ["game", "discord", "command"] },
  { emoji: "🌆", label: "Web", keywords: ["web", "frontend", "site"] },
  { emoji: "🎬", label: "Video", keywords: ["video", "editing", "media"] },
  { emoji: "🧪", label: "Tools", keywords: ["tools", "automation", "internal"] },
  { emoji: "🧠", label: "Research", keywords: ["research", "idea", "planning"] },
  { emoji: "📦", label: "Product", keywords: ["product", "mvp", "build"] },
  { emoji: "💡", label: "Idea", keywords: ["idea", "concept"] },
  { emoji: "⚙️", label: "System", keywords: ["system", "service"] },
  { emoji: "🛠️", label: "Engineering", keywords: ["engineering", "dev"] },
  { emoji: "📱", label: "Mobile", keywords: ["mobile", "app"] }
];

export type ProjectDraft = {
  icon: string;
  name: string;
  subtitle: string;
  status: ProjectStatus;
  weeklyHours: number;
  localRepoPath: string | null;
  remoteRepo: string | null;
};

function baseDraft(project?: Project): ProjectDraft {
  return {
    icon: project?.icon ?? "🧩",
    name: project?.name ?? "",
    subtitle: project?.subtitle ?? "",
    status: (project?.status ?? "Not Started") as ProjectStatus,
    weeklyHours: project?.weeklyHours ?? 0,
    localRepoPath: project?.localRepoPath ?? null,
    remoteRepo: project?.remoteRepo ?? project?.githubRepo ?? null
  };
}

export default function ProjectModal({
  open,
  project,
  repos,
  onClose,
  onSave,
  onArchive,
  onDelete
}: {
  open: boolean;
  project?: Project | null;
  repos: LocalRepo[];
  onClose: () => void;
  onSave: (draft: ProjectDraft) => void;
  onArchive: (archive: boolean) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(() => baseDraft(project ?? undefined));
  const [emojiQuery, setEmojiQuery] = useState("");

  React.useEffect(() => {
    if (open) {
      setDraft(baseDraft(project ?? undefined));
      setEmojiQuery("");
    }
  }, [open, project?.id]);

  const filteredEmoji = useMemo(() => {
    const query = emojiQuery.trim().toLowerCase();
    if (!query) return EMOJI_OPTIONS;
    return EMOJI_OPTIONS.filter((entry) => {
      return (
        entry.label.toLowerCase().includes(query) ||
        entry.keywords.some((word) => word.includes(query)) ||
        entry.emoji.includes(query)
      );
    });
  }, [emojiQuery]);

  if (!open) return null;

  const isEditing = Boolean(project);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="glass-hero w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              {isEditing ? "Edit Project" : "Create Project"}
            </p>
            <h3 className="text-lg font-semibold">{isEditing ? "Project Settings" : "New Project"}</h3>
          </div>
          <button className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border border-muted bg-black/30 p-3">
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Emoji Picker</label>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="input"
                placeholder="Search emoji"
                value={emojiQuery}
                onChange={(event) => setEmojiQuery(event.target.value)}
              />
              <div className="chip text-lg">{draft.icon}</div>
            </div>
            <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-auto">
              {filteredEmoji.map((entry) => (
                <button
                  type="button"
                  key={entry.emoji}
                  className={`rounded-lg border px-2 py-1 text-sm ${draft.icon === entry.emoji
                      ? "border-white/30 bg-strong"
                      : "border-muted bg-subtle hover:bg-muted"
                    }`}
                  onClick={() => setDraft((prev) => ({ ...prev, icon: entry.emoji }))}
                >
                  {entry.emoji} <span className="text-muted">{entry.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Name *</span>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Subtitle</span>
              <input
                className="input"
                value={draft.subtitle}
                onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Status</span>
              <Select
                className="w-full"
                value={draft.status}
                onChange={(val) => setDraft((prev) => ({ ...prev, status: val as ProjectStatus }))}
                options={[
                  { value: "Not Started", label: "Not Started" },
                  { value: "In Progress", label: "In Progress" },
                  { value: "Review", label: "Review" },
                  { value: "On Hold", label: "On Hold" },
                  { value: "Done", label: "Done" },
                  { value: "Archived", label: "Archived" }
                ]}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Weekly Hours</span>
              <input
                className="input"
                type="number"
                min={0}
                max={40}
                value={draft.weeklyHours}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    weeklyHours: Math.max(0, Math.min(40, Number(event.target.value) || 0))
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-muted">Local Repo</span>
              <Select
                className="w-full"
                value={draft.localRepoPath ?? ""}
                onChange={(val) =>
                  setDraft((prev) => ({ ...prev, localRepoPath: val || null }))
                }
                options={[
                  { value: "", label: repos.length === 0 ? "No repos detected — scan in Settings" : "None" },
                  ...repos.map((repo) => ({ value: repo.path, label: `${repo.name} — ${repo.path}` }))
                ]}
              />
              {repos.length === 0 && (
                <p className="text-xs text-amber-300/70 mt-0.5">
                  No git repos found. Go to Settings → Local Git to add watch directories and scan.
                </p>
              )}
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-muted">GitHub Repo (owner/name)</span>
              <input
                className="input"
                value={draft.remoteRepo ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, remoteRepo: event.target.value.trim() || null }))
                }
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            {isEditing && (
              <>
                <button
                  className="button-secondary"
                  onClick={() => onArchive(project?.status !== "Archived")}
                >
                  {project?.status === "Archived" ? "Unarchive" : "Archive"}
                </button>
                <button className="button-secondary text-red-200" onClick={onDelete}>
                  Delete
                </button>
              </>
            )}
          </div>
          <button
            className="button-primary"
            onClick={() => {
              if (!draft.name.trim()) return;
              onSave({ ...draft, name: draft.name.trim(), subtitle: draft.subtitle.trim() });
            }}
          >
            {isEditing ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
