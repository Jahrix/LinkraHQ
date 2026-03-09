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
    onBuildPlan: (prompt?: string) => Promise<{ taskIds: string[], rationale: string } | null>;
    onSave: (taskIds: string[], source: "manual" | "auto") => void;
    onRemove: (id: string) => void;
    onStartFocus: (id: string) => void;
}) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [previewIds, setPreviewIds] = useState<string[] | null>(null);
    const [rationale, setRationale] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleBuildPlan = async () => {
        setIsGenerating(true);
        setError(null);
        setPreviewIds(null);
        setRationale(null);
        try {
            const result = await onBuildPlan(prompt);
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

            {!previewIds && (
                <div className="mt-5">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">User Guidance (Optional)</label>
                    <div className="relative group">
                        <textarea
                            className="input min-h-[60px] py-3 pr-10 resize-none text-sm bg-subtle/50 focus:bg-subtle border-stroke/50 group-hover:border-stroke transition-all"
                            placeholder="What's your primary focus for today? e.g. 'Documentation' or 'Bug fixes'..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                        <div className="absolute right-3 top-3 opacity-30 group-focus-within:opacity-60 transition-opacity">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                        </div>
                    </div>
                </div>
            )}

            {rationale && previewIds && (
                <div className="mt-4 p-5 rounded-2xl bg-accent/5 border border-accent/20 text-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-50" />
                    <div className="flex items-center gap-2 mb-2 text-accent font-black uppercase tracking-[0.2em] text-[10px]">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Strategist Rationale
                    </div>
                    <p className="leading-relaxed text-white/90 italic font-medium">"{rationale}"</p>
                </div>
            )}

            <div className={`mt-6 space-y-2 flex-1 overflow-y-auto pr-2 ${isGenerating ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                {queuedItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-white/5 rounded-2xl p-10 bg-white/[0.01]">
                        <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5 shadow-inner">
                            <svg className="w-6 h-6 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <h3 className="text-base font-bold text-white/90 mb-1 tracking-tight">Deployment Ready</h3>
                        <p className="text-xs text-muted/60 max-w-[220px] leading-relaxed">Your queue is empty. Use <span className="text-accent font-bold">Build My Plan</span> for an AI-optimized mission sequence.</p>
                    </div>
                ) : (
                    queuedItems.map((entry, idx) => (
                        <div
                            key={entry!.task.id}
                            className={`group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${idx === 0
                                ? "bg-white/[0.08] border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.05)] scale-[1.01]"
                                : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"
                                }`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black transition-transform group-hover:scale-105 ${idx === 0 ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]" : "bg-white/5 text-muted/40 border border-white/5"
                                }`}>
                                {idx + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted/50 truncate">
                                        {entry!.project.name}
                                    </span>
                                    {idx === 0 && (
                                        <span className="text-[8px] bg-accent/20 text-accent font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-accent/20">Primary Objective</span>
                                    )}
                                </div>
                                <div className={`text-sm truncate leading-snug ${idx === 0 ? "font-bold text-white" : "font-medium text-white/70"}`}>
                                    {entry!.task.text}
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                {!previewIds && (
                                    <button
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-muted hover:text-white transition-colors"
                                        onClick={() => onStartFocus(entry!.task.id)}
                                        title="Start Focus"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        </svg>
                                    </button>
                                )}
                                <button
                                    className="p-2 bg-white/5 hover:bg-red-500/10 rounded-xl text-muted/50 hover:text-red-400 transition-colors"
                                    onClick={() => previewIds ? removePreviewItem(entry!.task.id) : onRemove(entry!.task.id)}
                                    title="Remove from queue"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
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
