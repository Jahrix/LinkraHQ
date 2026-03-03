import React, { useEffect, useMemo, useRef, useState } from "react";

type EmojiEntry = {
  emoji: string;
  label: string;
  keywords: string[];
  category: string;
};

const EMOJI_GROUPS: Array<{ name: string; items: EmojiEntry[] }> = [
  {
    name: "Recent",
    items: []
  },
  {
    name: "Product",
    items: [
      { emoji: "🚀", label: "Launch", keywords: ["ship", "release", "deploy"], category: "Product" },
      { emoji: "🧩", label: "Platform", keywords: ["system", "core", "product"], category: "Product" },
      { emoji: "💡", label: "Idea", keywords: ["idea", "concept", "brainstorm"], category: "Product" },
      { emoji: "📦", label: "Package", keywords: ["box", "deliver", "bundle"], category: "Product" },
      { emoji: "🧠", label: "Research", keywords: ["thinking", "analysis", "study"], category: "Product" },
      { emoji: "🎯", label: "Goal", keywords: ["focus", "target", "priority"], category: "Product" }
    ]
  },
  {
    name: "Build",
    items: [
      { emoji: "🛠️", label: "Engineering", keywords: ["build", "dev", "code"], category: "Build" },
      { emoji: "⚙️", label: "System", keywords: ["backend", "ops", "service"], category: "Build" },
      { emoji: "💻", label: "Code", keywords: ["frontend", "terminal", "app"], category: "Build" },
      { emoji: "🧪", label: "Experiment", keywords: ["test", "tools", "automation"], category: "Build" },
      { emoji: "🧱", label: "Foundation", keywords: ["infra", "architecture", "base"], category: "Build" },
      { emoji: "📱", label: "Mobile", keywords: ["ios", "android", "phone"], category: "Build" }
    ]
  },
  {
    name: "Signals",
    items: [
      { emoji: "🔥", label: "Urgent", keywords: ["hot", "active", "critical"], category: "Signals" },
      { emoji: "✅", label: "Done", keywords: ["complete", "ship", "finish"], category: "Signals" },
      { emoji: "⏳", label: "In Progress", keywords: ["waiting", "wip", "time"], category: "Signals" },
      { emoji: "🚧", label: "Blocked", keywords: ["construction", "blocked", "hold"], category: "Signals" },
      { emoji: "📈", label: "Growth", keywords: ["metrics", "scale", "progress"], category: "Signals" },
      { emoji: "⚡", label: "Momentum", keywords: ["fast", "speed", "energy"], category: "Signals" }
    ]
  },
  {
    name: "Studio",
    items: [
      { emoji: "🎬", label: "Video", keywords: ["editing", "media", "film"], category: "Studio" },
      { emoji: "🎨", label: "Design", keywords: ["art", "creative", "brand"], category: "Studio" },
      { emoji: "🕹️", label: "Gaming", keywords: ["game", "play", "discord"], category: "Studio" },
      { emoji: "🌆", label: "Web", keywords: ["site", "landing", "browser"], category: "Studio" },
      { emoji: "📚", label: "Docs", keywords: ["writing", "notes", "guide"], category: "Studio" },
      { emoji: "📝", label: "Writing", keywords: ["draft", "copy", "journal"], category: "Studio" }
    ]
  }
];

const FALLBACK_RECENTS = ["🚀", "🧩", "💡", "🛠️", "✅", "🔥", "📦", "🧠", "⚡", "🎯"];
const RECENT_STORAGE_KEY = "linkra-emoji-recent";
const EMOJI_BY_VALUE = new Map(
  EMOJI_GROUPS.flatMap((group) => group.items).map((entry) => [entry.emoji, entry] as const)
);

function getRecent() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && EMOJI_BY_VALUE.has(item));
    }
  } catch {
    return [];
  }
  return [];
}

export function rememberRecentEmoji(emoji: string) {
  const merged = [emoji, ...getRecent().filter((item) => item !== emoji)].slice(0, 20);
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(merged));
}

export default function EmojiPicker({
  value,
  onChange
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("Recent");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => {
    const recents = getRecent();
    const recentEntries = (recents.length ? recents : FALLBACK_RECENTS)
      .map((emoji) => EMOJI_BY_VALUE.get(emoji))
      .filter((entry): entry is EmojiEntry => Boolean(entry));

    return EMOJI_GROUPS.map((group) =>
      group.name === "Recent"
        ? {
            ...group,
            items: recentEntries
          }
        : group
    );
  }, [value, open]);

  const activeItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      return Array.from(new Map(
        groups
          .flatMap((group) => group.items)
          .filter((entry) => {
            const haystack = `${entry.label} ${entry.category} ${entry.keywords.join(" ")} ${entry.emoji}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          })
          .map((entry) => [entry.emoji, entry] as const)
      ).values());
    }

    const group = groups.find((item) => item.name === activeGroup) ?? groups[0];
    return group.items;
  }, [activeGroup, groups, query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="input flex items-center justify-between gap-3 text-left"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Choose project emoji"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <span className="text-2xl">{value}</span>
          <span className="text-sm text-white/70">
            {EMOJI_BY_VALUE.get(value)?.label ?? "Select emoji"}
          </span>
        </span>
        <span className="text-xs uppercase tracking-[0.2em] text-white/40">{open ? "Close" : "Browse"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-white/10 bg-[#0a0d14]/95 p-3 shadow-2xl backdrop-blur">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search emoji..."
            aria-label="Search emoji"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {groups.map((group) => (
              <button
                key={group.name}
                type="button"
                className={activeGroup === group.name && !query.trim() ? "button-primary" : "button-secondary"}
                onClick={() => {
                  setActiveGroup(group.name);
                  setQuery("");
                }}
                aria-label={`Show ${group.name} emojis`}
              >
                {group.name}
              </button>
            ))}
          </div>
          <div className="mt-3 grid max-h-56 grid-cols-6 gap-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-8">
            {activeItems.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                className={`rounded-xl border px-2 py-2 text-center ${
                  value === entry.emoji
                    ? "border-[color:var(--accent)] bg-white/15"
                    : "border-white/10 bg-white/5 hover:border-white/30"
                }`}
                onClick={() => {
                  rememberRecentEmoji(entry.emoji);
                  onChange(entry.emoji);
                  setOpen(false);
                  setQuery("");
                }}
                aria-label={`Choose ${entry.label}`}
              >
                <div className="text-xl">{entry.emoji}</div>
                <div className="mt-1 text-[10px] text-white/55">{entry.label}</div>
              </button>
            ))}
            {activeItems.length === 0 && (
              <p className="col-span-full text-sm text-white/60">No emojis match that search.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
