import React, { useState } from "react";
import GlassPanel from "./GlassPanel";
import SectionHeader from "./SectionHeader";

export default function TodayPlanQueue({
    planDraft,
    allTaskLookup,
    onBuildPlan,
    onSave,
    onRemove,
    onStartFocus
}: {
    planDraft: string[];
    allTaskLookup: Map<string, { project: any, task: any }>;
    onBuildPlan: () => Promise<{ taskIds: string[], rationale: string } | null>;
    onSave: (taskIds: string[], source: "manual" | "auto") => void;
    onRemove: (id: string) => void;
    onStartFocus: (id: string) => void;
}) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewIds, setPreviewIds] = useState<string[] | null>(null);
    const [rationale, setRationale] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleBuildPlan = async () => {
        setIsGenerating(true);
        setError(null);
        setPreviewIds(null);
        setRationale(null);
        try {
            const result = await onBuildPlan();
            if (result) {
                setPreviewIds(result.taskIds);
                setRationale(result.rationale);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to build plan");
        } finally {
            setIsGenerating(false);
        }
    };

    const acceptPlan = () => {
        if (previewIds) {
            onSave(previewIds, "auto");
            setPreviewIds(null);
            setRationale(null);
        }
    };

    const discardPlan = () => {
        setPreviewIds(null);
        setRationale(null);
    };

    const removePreviewItem = (id: string) => {
        setPreviewIds(prev => prev ? prev.filter(tid => tid !== id) : null);
    };

    const activeIds = previewIds ?? planDraft;
    const queuedItems = activeIds.map(id => allTaskLookup.get(id)).filter(Boolean);

    return (
        <GlassPanel variant="standard" className="flex flex-col min-h-[300px] mt-6 relative" id="today-plan-queue">
            <SectionHeader
                title={previewIds ? "Plan Review" : "Today's Queue"}
                subtitle={`${queuedItems.length} items lined up`}
                rightControls={
                    <div className="flex gap-2">
                        {!previewIds && (
                            <>
                                <button className="button-secondary text-xs" onClick={handleBuildPlan} disabled={isGenerating}>
                                    <svg className={`w-3.5 h-3.5 mr-1.5 inline ${isGenerating ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    {isGenerating ? "Building..." : "Build My Plan"}
                                </button>
                                <button className="button-primary text-xs" onClick={() => onSave(planDraft, "manual")} disabled={isGenerating || planDraft.length === 0}>Save Queue</button>
                            </>
                        )}
                        {previewIds && (
                            <>
                                <button className="button-secondary text-xs" onClick={discardPlan}>Cancel</button>
                                <button className="button-primary text-xs" onClick={acceptPlan}>Accept Plan</button>
                            </>
                        )}
                    </div>
                }
            />

            {error && (
                <div className="my-4 rounded-xl border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300 flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <button className="button-secondary text-xs" onClick={handleBuildPlan} disabled={isGenerating}>
                        Retry
                    </button>
                </div>
            )}

            {rationale && previewIds && (
                <div className="mt-4 p-4 rounded-xl bg-accent/10 border border-accent/20 text-sm text-accent-100">
                    <p className="font-semibold mb-1 text-accent">Claude's Rationale:</p>
                    <p className="leading-relaxed opacity-90">{rationale}</p>
                </div>
            )}

            <div className={`mt-5 space-y-3 flex-1 overflow-y-auto pr-2 ${isGenerating ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                {queuedItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-stroke rounded-xl p-8 bg-subtle/50">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                            <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-strong mb-1">Queue is empty</h3>
                        <p className="text-xs text-muted max-w-[200px]">Click Build My Plan to let AI suggest tasks, or add manually.</p>
                    </div>
                ) : (
                    queuedItems.map((entry, idx) => (
                        <div
                            key={entry!.task.id}
                            className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${idx === 0
                                ? "bg-accent/10 border-accent/30 shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                                : "bg-subtle/50 border-subtle hover:bg-subtle"
                                }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${idx === 0 ? "bg-accent text-white shadow-lg" : "bg-white/10 text-muted"
                                }`}>
                                {idx + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted truncate">
                                        {entry!.project.name}
                                    </span>
                                    {idx === 0 && (
                                        <span className="text-[9px] bg-accent/20 text-accent-100 px-1.5 py-0.5 rounded text-accent">Active Hero</span>
                                    )}
                                </div>
                                <div className={`text-sm truncate ${idx === 0 ? "font-semibold text-strong" : "text-strong/90"}`}>
                                    {entry!.task.text}
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!previewIds && (
                                    <button
                                        className="p-1.5 hover:bg-white/10 rounded-md text-muted hover:text-white transition"
                                        onClick={() => onStartFocus(entry!.task.id)}
                                        title="Start Focus"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </button>
                                )}
                                <button
                                    className="p-1.5 hover:bg-red-500/20 rounded-md text-muted hover:text-red-400 transition"
                                    onClick={() => previewIds ? removePreviewItem(entry!.task.id) : onRemove(entry!.task.id)}
                                    title="Remove from queue"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </GlassPanel>
    );
}
