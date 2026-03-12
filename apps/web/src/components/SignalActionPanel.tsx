import React, { useEffect, useState } from "react";
import Pill from "./Pill";
import { type SuggestedAction } from "@linkra/shared";
import { type InsightGroup } from "../lib/insightStore";
import { shortLabelForInsightAction } from "../lib/taskRules";

const SNOOZE_OPTIONS = [
  { label: "24 hours", type: "SNOOZE_1D" as const },
  { label: "7 days", type: "SNOOZE_1W" as const },
  { label: "Forever", type: "DISMISS" as const }
];

export default function SignalActionPanel({
    groupedInsights,
    runInsightAction
}: {
    groupedInsights: InsightGroup[];
    runInsightAction: (group: InsightGroup, action: SuggestedAction) => void;
}) {
    const [snoozeOpenKey, setSnoozeOpenKey] = useState<string | null>(null);

    useEffect(() => {
        if (!snoozeOpenKey) return;
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest("[data-snooze-dropdown]")) {
                setSnoozeOpenKey(null);
            }
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [snoozeOpenKey]);

    return (
        <div className="mt-4 flex-1 grid gap-3 overflow-y-auto pr-2">
            {groupedInsights.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <div className="text-4xl mb-3 opacity-20">🪩</div>
                    <p className="text-sm text-muted font-medium">All clear. Smooth sailing.</p>
                </div>
            )}
            {groupedInsights.map(group => (
                <div key={group.key} className="p-3.5 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition">
                    <div className="flex justify-between items-start gap-3 relative">
                        <div className="font-semibold text-sm leading-tight text-white/90">{group.title}</div>
                        <div className="flex items-center gap-1.5 flex-shrink-0" data-snooze-dropdown>
                            <Pill tone={group.severity === 'crit' ? 'danger' : group.severity === 'warn' ? 'warning' : 'neutral'}>
                                {group.severity}
                            </Pill>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSnoozeOpenKey(snoozeOpenKey === group.key ? null : group.key);
                                }}
                                className="text-white/40 hover:text-white/70 transition text-xs px-1"
                                title="Snooze"
                            >🔕</button>
                            {snoozeOpenKey === group.key && (
                                <div className="absolute right-0 top-6 z-50 bg-[#1a1a1f] border border-white/10 rounded-xl shadow-xl py-1 min-w-[140px]">
                                    {SNOOZE_OPTIONS.map(({ label, type }) => (
                                        <button
                                            key={type}
                                            onClick={() => {
                                                runInsightAction(group, {
                                                    id: `${group.key}-snooze-${type}`,
                                                    type,
                                                    label,
                                                    payload: {}
                                                } as SuggestedAction);
                                                setSnoozeOpenKey(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 transition"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="text-xs text-muted mt-2 line-clamp-2 leading-relaxed opacity-80">{group.reason}</div>
                    {group.actions.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                            {group.actions.map((action: SuggestedAction) => (
                                <button
                                    key={action.id}
                                    className="text-[10px] font-bold uppercase tracking-wider bg-white/10 hover:bg-accent/20 hover:text-accent-100 text-white/70 px-2 py-1 rounded transition whitespace-nowrap"
                                    onClick={() => runInsightAction(group, action)}
                                >
                                    {shortLabelForInsightAction(action)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
