import React from "react";
import GlassPanel from "./GlassPanel";

type TaskProps = {
    id: string;
    text: string;
    projectName: string;
};

export default function TodayMissionHero({
    title = "Mission Command",
    description,
    progress = 0,
    tasksDone = 0,
    totalTasks = 0,
    topTask,
    tasksRemaining,
    isClosed,
    onStartFocus,
    onToggleClosed,
    onBuildPlan,
    onFillMyDay,
    onSaveNotes,
    initialNotes = "",
}: {
    title?: string;
    description?: string;
    progress?: number;
    tasksDone?: number;
    totalTasks?: number;
    topTask: TaskProps | null;
    tasksRemaining: number;
    isClosed?: boolean;
    onStartFocus: (taskId: string) => void;
    onToggleClosed?: () => void;
    onBuildPlan?: () => void;
    onFillMyDay?: () => void;
    onSaveNotes?: (notes: string) => void;
    initialNotes?: string;
}) {
    return (
        <GlassPanel variant="hero" className="w-full relative overflow-hidden group">
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-r from-accent/30 to-accent-2/10"></div>

            <div className="relative z-10 flex flex-col lg:flex-row items-stretch justify-between gap-8 p-6 md:p-8">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-2/80">{title}</span>
                    </div>

                    <h2 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-4 leading-[1.05]">
                        {isClosed ? "Operations Secured 🔒" : (topTask ? topTask.text : "Protocol Awaiting.")}
                    </h2>

                    {description && (
                        <p className="text-sm md:text-md text-white/40 font-bold uppercase tracking-widest mb-6">
                            {description}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-6 mt-8">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Completion Efficiency</span>
                            <div className="flex items-end gap-2">
                                <span className="text-3xl font-black text-white leading-none">{progress}%</span>
                                <span className="text-[10px] font-bold text-white/20 mb-1 uppercase tracking-tighter">{tasksDone} / {totalTasks} Units</span>
                            </div>
                            <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                                <div
                                    className="h-full bg-accent transition-all duration-1000 shadow-[0_0_10px_rgba(93,216,255,0.5)]"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        {tasksRemaining > 1 && (
                            <div className="h-8 w-[1px] bg-white/10 mx-2 hidden sm:block"></div>
                        )}

                        {tasksRemaining > 1 && (
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Priority Backlog</span>
                                <span className="text-xl font-bold text-white/80 tracking-tighter tabular-nums gap-2 flex items-center">
                                    <span className="px-1.5 py-0.5 bg-white/10 rounded text-xs">+{tasksRemaining - 1}</span>
                                    UNITS QUEUED
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-4 flex-shrink-0 w-full lg:w-80 justify-end">
                    {topTask && !isClosed && (
                        <button
                            className="w-full hover-lift relative overflow-hidden rounded-2xl bg-white text-black font-black text-xl px-10 py-6 flex items-center justify-center gap-4 transition shadow-[0_0_50px_rgba(255,255,255,0.1)] hover:shadow-[0_0_70px_rgba(255,255,255,0.2)] active:scale-95 group/btn"
                            onClick={() => onStartFocus(topTask.id)}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-accent-2/10 to-accent/10 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                            <svg className="w-6 h-6 relative z-10 fill-current" viewBox="0 0 24 24">
                                <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                            <span className="relative z-10 uppercase tracking-tighter">Initiate focus</span>
                        </button>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={onToggleClosed}
                            className={`flex flex-col items-center justify-center py-4 rounded-xl border transition-all ${isClosed
                                ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_20px_rgba(93,216,255,0.15)]"
                                : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20"
                                }`}
                        >
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] mb-1">{isClosed ? "REOPEN" : "FINALIZE"}</span>
                            <span className="text-xs font-bold uppercase tracking-widest">{isClosed ? "Cycle" : "Day"}</span>
                        </button>

                        <button
                            onClick={onBuildPlan}
                            className="flex flex-col items-center justify-center py-4 rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all font-bold group/ai"
                        >
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] mb-1 group-hover/ai:text-accent transition-colors">Generate</span>
                            <span className="text-xs uppercase tracking-widest">AI Plan</span>
                        </button>

                        {onFillMyDay && (
                            <button
                                onClick={onFillMyDay}
                                className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-opacity"
                                style={{ background: "#7c5cfc" }}
                            >
                                Fill My Day ✦
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </GlassPanel>
    );
}
