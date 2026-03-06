import React, { useMemo, useState } from "react";

export interface Command {
  label: string;
  action: () => void;
}

export default function CommandPalette({
  open,
  commands,
  onClose
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()));
  }, [commands, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur" onClick={onClose}>
      <div className="panel w-[min(640px,90vw)]" onClick={(event) => event.stopPropagation()}>
        <input
          className="w-full rounded-xl border border-muted bg-black/40 px-4 py-3 text-sm text-strong outline-none"
          placeholder="Search commands..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <div className="mt-4 grid gap-2 max-h-72 overflow-auto">
          {filtered.map((cmd) => (
            <button
              key={cmd.label}
              className="rounded-xl border border-muted bg-subtle px-4 py-2 text-left text-sm hover:border-white/30"
              onClick={() => {
                cmd.action();
                onClose();
              }}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
