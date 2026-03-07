import React from "react";
import GlassPanel from "./GlassPanel";

type TaskProps = {
    id: string;
    text: string;
    projectName: string;
};

export default function TodayMissionHero({
    topTask,
    tasksRemaining,
    onStartFocus
}: {
    topTask: TaskProps | null;
    tasksRemaining: number;
    onStartFocus: (taskId: string) => void;
}) {
    return (
        <GlassPanel variant="hero" className="w-full relative overflow-hidden group">
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-r from-accent/30 to-accent-2/10"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 p-4 md:p-6">
                <div className="flex-1 text-center md:text-left min-w-0">
                    <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-accent-2">Today's Mission</span>
                        {tasksRemaining > 1 && (
                            <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-full ml-2 border border-white/10">
                                {tasksRemaining - 1} in queue
                            </span>
                        )}
                    </div>

                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white mb-2 leading-tight">
                        {topTask ? topTask.text : "No mission planned."}
                    </h2>

                    <div className="text-sm md:text-base text-muted font-medium flex items-center justify-center md:justify-start gap-2">
                        {topTask ? (
                            <>
                                <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                                {topTask.projectName}
                            </>
                        ) : (
                            "Take a breather or add a task below."
                        )}
                    </div>
                </div>

                {topTask && (
                    <div className="flex-shrink-0 w-full md:w-auto">
                        <button
                            className="w-full md:w-auto hover-lift relative overflow-hidden rounded-xl bg-white text-black font-semibold text-lg px-8 py-5 flex items-center justify-center gap-3 transition shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_60px_rgba(255,255,255,0.3)]"
                            onClick={() => onStartFocus(topTask.id)}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-accent-2/20 to-accent/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="relative z-10">Start Focus</span>
                        </button>
                    </div>
                )}
            </div>
        </GlassPanel>
    );
}
