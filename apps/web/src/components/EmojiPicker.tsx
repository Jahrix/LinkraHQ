import React, { useMemo, useState } from "react";

const EMOJI_GROUPS: Array<{ name: string; items: string[] }> = [
  { name: "Recent", items: [] },
  { name: "Product", items: ["🚀", "🧩", "💡", "🛠️", "📦", "🧠", "⚡", "📈", "📊", "🎯"] },
  { name: "Work", items: ["💻", "🗂️", "📚", "🧪", "🔒", "🧵", "🧱", "🧭", "🧰", "📝"] },
  { name: "Status", items: ["✅", "🔥", "⏳", "🧯", "🚧", "🧼", "🧨", "💥", "🌱", "🏁"] },
  { name: "Nature", items: ["🌊", "🌤️", "🌙", "🌿", "🌸", "🌵", "🪴", "🍀", "🌈", "⭐"] }
];

const RECENT_STORAGE_KEY = "linkra-emoji-recent";

function getRecent() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
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

  const groups = useMemo(() => {
    const recents = getRecent();
    return EMOJI_GROUPS.map((group) =>
      group.name === "Recent"
        ? {
            ...group,
            items: recents.length ? recents : ["🚀", "🧩", "💡", "✅", "🔥", "📦", "⚡", "🧠", "📈", "🎯"]
          }
        : group
    );
  }, []);

  const activeItems = useMemo(() => {
    const group = groups.find((item) => item.name === activeGroup) ?? groups[0];
    if (!query.trim()) return group.items;
    return group.items.filter((emoji) => emoji.includes(query.trim()));
  }, [activeGroup, groups, query]);

  return (
    <div className="space-y-3">
      <input
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search emoji..."
        aria-label="Search emoji"
      />
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <button
            key={group.name}
            className={activeGroup === group.name ? "button-primary" : "button-secondary"}
            onClick={() => setActiveGroup(group.name)}
            aria-label={`Show ${group.name} emojis`}
          >
            {group.name}
          </button>
        ))}
      </div>
      <div className="grid max-h-44 grid-cols-8 gap-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3">
        {activeItems.map((emoji) => (
          <button
            key={emoji}
            className={`rounded-lg border px-2 py-2 text-xl ${
              value === emoji
                ? "border-[color:var(--accent)] bg-white/15"
                : "border-white/10 bg-white/5 hover:border-white/30"
            }`}
            onClick={() => onChange(emoji)}
            aria-label={`Choose ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
