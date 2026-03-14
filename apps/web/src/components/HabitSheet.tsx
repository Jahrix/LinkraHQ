import React, { useEffect, useState } from "react";
import type { Habit } from "@linkra/shared";
import EmojiPicker from "./EmojiPicker";
import Select from "./Select";
import type { SelectOption } from "./Select";

const ACCENT_COLORS = ["#7c5cfc", "#5DD8FF", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface HabitSheetProps {
  open: boolean;
  habit?: Habit | null;
  projectOptions?: SelectOption[];
  onSave: (data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>) => void;
  onArchive?: () => void;
  onClose: () => void;
}

export default function HabitSheet({ open, habit, projectOptions = [], onSave, onArchive, onClose }: HabitSheetProps) {
  const [icon, setIcon] = useState(habit?.icon ?? "⚡");
  const [title, setTitle] = useState(habit?.title ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekdays" | "custom">(habit?.frequency ?? "daily");
  const [customDays, setCustomDays] = useState<number[]>(habit?.customDays ?? []);
  const [color, setColor] = useState(habit?.color ?? "#7c5cfc");
  const [targetStreak, setTargetStreak] = useState(habit?.targetStreak ?? 30);
  const [linkedProjectId, setLinkedProjectId] = useState(habit?.linkedProjectId ?? "");
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (open) {
      setIcon(habit?.icon ?? "⚡");
      setTitle(habit?.title ?? "");
      setFrequency(habit?.frequency ?? "daily");
      setCustomDays(habit?.customDays ?? []);
      setColor(habit?.color ?? "#7c5cfc");
      setTargetStreak(habit?.targetStreak ?? 30);
      setLinkedProjectId(habit?.linkedProjectId ?? "");
      setConfirmArchive(false);
    }
  }, [open, habit]);

  const toggleDay = (day: number) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      icon,
      title: title.trim(),
      frequency,
      customDays: frequency === "custom" ? customDays : [],
      color,
      targetStreak,
      linkedProjectId: linkedProjectId || null,
      archivedAt: null
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] bg-[#1a1a1f] border border-white/10 rounded-t-3xl md:rounded-2xl z-[70] px-6 pb-8 pt-4 max-h-[90vh] overflow-y-auto">
        <div className="w-12 h-1.5 bg-stroke rounded-full mx-auto mb-6 md:hidden" />
        <h2 className="text-lg font-black text-white mb-6">{habit ? "Edit Habit" : "New Habit"}</h2>

        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-4">
          <EmojiPicker value={icon} onChange={setIcon} />
          <input
            className="input flex-1"
            placeholder="Habit name"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        {/* Frequency */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">Frequency</label>
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(["daily", "weekdays", "custom"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className={`flex-1 py-2 text-xs font-bold capitalize transition-all ${
                  frequency === f ? "bg-accent text-white" : "bg-white/5 text-muted hover:bg-white/10"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {frequency === "custom" && (
            <div className="flex gap-1.5 mt-3 justify-between">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={`w-9 h-9 rounded-full text-xs font-bold transition-all border ${
                    customDays.includes(idx)
                      ? "text-white border-transparent"
                      : "bg-white/5 text-muted border-white/10 hover:bg-white/10"
                  }`}
                  style={customDays.includes(idx) ? { backgroundColor: color } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">Color</label>
          <div className="flex gap-2">
            {ACCENT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color === c ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Target Streak */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">Target Streak</label>
          <div className="flex items-center gap-3">
            <button
              className="w-8 h-8 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-all"
              onClick={() => setTargetStreak(v => Math.max(1, v - 1))}
            >
              −
            </button>
            <span className="text-white font-bold text-lg w-12 text-center tabular-nums">{targetStreak}</span>
            <button
              className="w-8 h-8 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-all"
              onClick={() => setTargetStreak(v => v + 1)}
            >
              +
            </button>
            <span className="text-muted text-xs">days</span>
          </div>
        </div>

        {/* Linked Project */}
        {projectOptions.length > 0 && (
          <div className="mb-6">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">Linked Project</label>
            <Select
              value={linkedProjectId}
              onChange={setLinkedProjectId}
              options={[{ value: "", label: "None" }, ...projectOptions]}
              placeholder="No project linked"
            />
          </div>
        )}

        <button
          className="button-primary w-full mb-3"
          onClick={handleSave}
          disabled={!title.trim()}
        >
          Save Habit
        </button>
        <button className="button-secondary w-full mb-4" onClick={onClose}>
          Cancel
        </button>

        {habit && onArchive && (
          !confirmArchive ? (
            <button
              className="w-full text-center text-sm text-red-400/70 hover:text-red-400 transition-colors py-2"
              onClick={() => setConfirmArchive(true)}
            >
              Archive Habit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-500/80 hover:bg-red-500 transition-all"
                onClick={onArchive}
              >
                Yes, Archive
              </button>
              <button
                className="flex-1 py-2 rounded-xl text-xs font-bold text-muted bg-white/5 hover:bg-white/10 transition-all"
                onClick={() => setConfirmArchive(false)}
              >
                Cancel
              </button>
            </div>
          )
        )}
      </div>
    </>
  );
}
