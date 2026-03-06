import React from "react";
import Pill from "./Pill";
import { type Insight, type SuggestedAction } from "@linkra/shared";
import { shortLabelForInsightAction } from "../lib/taskRules";

export default function SignalActionPanel({
    groupedInsights,
    runInsightAction
}: {
    groupedInsights: any[];
    runInsightAction: (group: any, action: SuggestedAction) => void;
}) {
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
                    <div className="flex justify-between items-start gap-3">
                        <div className="font-semibold text-sm leading-tight text-white/90">{group.title}</div>
                        <Pill tone={group.severity === 'crit' ? 'danger' : group.severity === 'warn' ? 'warning' : 'neutral'}>
                            {group.severity}
                        </Pill>
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
