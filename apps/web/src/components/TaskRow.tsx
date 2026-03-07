import React from "react";

export default function TaskRow({
  text,
  done,
  dueLabel,
  meta,
  onToggle,
  onDelete
}: {
  text: string;
  done: boolean;
  dueLabel?: { text: string; tone: "normal" | "overdue" };
  meta?: string;
  onToggle: (next: boolean) => void;
  onDelete?: () => void;
}) {
  return (
    <label className="group flex items-center justify-between rounded-lg border border-muted bg-subtle px-3 py-2 hover:border-white/30 transition">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} />
        <div className="flex flex-col min-w-0">
          <span className={done ? "line-through text-muted truncate" : "text-strong truncate"}>{text}</span>
          {meta && <span className="text-xs text-muted">{meta}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {dueLabel && (
          <span className={`text-xs ${dueLabel.tone === "overdue" ? "text-red-400" : "text-muted"}`}>
            {dueLabel.text}
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition"
            title="Delete task"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </label>
  );
}
