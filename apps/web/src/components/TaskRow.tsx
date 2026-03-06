import React from "react";

export default function TaskRow({
  text,
  done,
  dueLabel,
  meta,
  onToggle
}: {
  text: string;
  done: boolean;
  dueLabel?: { text: string; tone: "normal" | "overdue" };
  meta?: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-muted bg-subtle px-3 py-2 hover:border-white/30 transition">
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} />
        <div className="flex flex-col">
          <span className={done ? "line-through text-muted" : "text-strong"}>{text}</span>
          {meta && <span className="text-xs text-muted">{meta}</span>}
        </div>
      </div>
      {dueLabel && (
        <span className={`text-xs ${dueLabel.tone === "overdue" ? "text-red-400" : "text-muted"}`}>
          {dueLabel.text}
        </span>
      )}
    </label>
  );
}
