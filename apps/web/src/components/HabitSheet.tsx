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
  onAutoSave?: (data: Partial<Omit<Habit, "id" | "createdAt" | "updatedAt">>) => Promise<void>;
  onArchive?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function HabitSheet({ open, habit, projectOptions = [], onSave, onAutoSave, onArchive, onDelete, onClose }: HabitSheetProps) {
  const isEditing = !!habit;
  const [icon, setIcon] = useState(habit?.icon ?? "⚡");
  const [title, setTitle] = useState(habit?.title ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekdays" | "custom">(habit?.frequency ?? "daily");
  const [customDays, setCustomDays] = useState<number[]>(habit?.customDays ?? []);
  const [color, setColor] = useState(habit?.color ?? "#7c5cfc");
  const [targetStreak, setTargetStreak] = useState(habit?.targetStreak ?? 30);
  const [linkedProjectId, setLinkedProjectId] = useState(habit?.linkedProjectId ?? "");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const isMounted = React.useRef(true);
  const isInitialLoad = React.useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (open) {
      isInitialLoad.current = true;
      setIcon(habit?.icon ?? "⚡");
      setTitle(habit?.title ?? "");
      setFrequency(habit?.frequency ?? "daily");
      setCustomDays(habit?.customDays ?? []);
      setColor(habit?.color ?? "#7c5cfc");
      setTargetStreak(habit?.targetStreak ?? 30);
      setLinkedProjectId(habit?.linkedProjectId ?? "");
      setConfirmArchive(false);
      setConfirmDelete(false);
      setSaveStatus("idle");
      setTimeout(() => {
        if (isMounted.current) isInitialLoad.current = false;
      }, 100);
    }
  }, [open, habit]);

  useEffect(() => {
    if (!open || !isEditing || !onAutoSave || isInitialLoad.current) return;
    if (!title.trim()) return;

    const timeout = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await onAutoSave({
          icon,
          title: title.trim(),
          frequency,
          customDays: frequency === "custom" ? customDays : [],
          color,
          targetStreak,
          linkedProjectId: linkedProjectId || null
        });
        if (isMounted.current) {
          setSaveStatus("saved");
          setTimeout(() => {
            if (isMounted.current) setSaveStatus("idle");
          }, 2000);
        }
      } catch (err) {
        if (isMounted.current) setSaveStatus("error");
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [icon, title, frequency, customDays, color, targetStreak, linkedProjectId, isEditing, open, onAutoSave]);

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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black text-white">{isEditing ? "Edit Habit" : "New Habit"}</h2>
          {isEditing && (
            <div className={`text-xs font-bold transition-opacity ${saveStatus !== "idle" ? "opacity-100" : "opacity-0"}`}>
              {saveStatus === "saving" && <span className="text-muted">Saving...</span>}
              {saveStatus === "saved" && <span className="text-green-500">Saved ✓</span>}
              {saveStatus === "error" && <span className="text-red-500">Failed to save</span>}
            </div>
          )}
        </div>

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

        <div className="flex flex-col gap-2 mt-4">
          {!isEditing && (
            <button
              className="button-primary w-full"
              onClick={handleSave}
              disabled={!title.trim()}
            >
              Save Habit
            </button>
          )}
          <button className="button-secondary w-full" onClick={onClose}>
            Cancel
          </button>
        </div>

        {habit && onArchive && (
          <div className="flex flex-col gap-2 mt-6 border-t border-white/10 pt-6">
            {!confirmArchive ? (
              <button
                className="w-full text-center text-sm font-bold text-amber-500/80 border border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-400 transition-all py-2.5 rounded-xl"
                onClick={() => setConfirmArchive(true)}
              >
                Archive Habit
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-center text-amber-500 mb-1">Are you sure you want to archive?</p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 transition-all"
                    onClick={onArchive}
                  >
                    Yes, Archive
                  </button>
                  <button
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-muted bg-white/5 hover:bg-white/10 transition-all border border-white/10"
                    onClick={() => setConfirmArchive(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!confirmDelete ? (
              <button
                className="w-full text-center text-sm font-bold text-red-500/80 border border-red-500/20 hover:bg-red-500/10 hover:text-red-400 transition-all py-2.5 rounded-xl"
                onClick={() => setConfirmDelete(true)}
              >
                Delete Forever
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-center text-red-500 mb-1">Are you sure? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-400 transition-all"
                    onClick={onDelete}
                  >
                    Yes, Delete
                  </button>
                  <button
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-muted bg-white/5 hover:bg-white/10 transition-all border border-white/10"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
