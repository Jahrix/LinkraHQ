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
    <div className="command-overlay" onClick={onClose}>
      <div className="glass command-panel" onClick={(event) => event.stopPropagation()}>
        <input
          className="input"
          placeholder="Search commands..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <div className="command-list">
          {filtered.map((cmd) => (
            <button
              key={cmd.label}
              className="command-item"
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
