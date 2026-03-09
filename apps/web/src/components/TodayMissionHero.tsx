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
    userName,
    isClosed,
    onStartFocus,
    onToggleClosed
}: {
    topTask: TaskProps | null;
    tasksRemaining: number;
    userName?: string | null;
    isClosed?: boolean;
    onStartFocus: (taskId: string) => void;
    onToggleClosed?: () => void;
}) {
    const [time, setTime] = React.useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const greeting = React.useMemo(() => {
        const hour = time.getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        if (hour < 21) return "Good Evening";
        return "Good Night";
    }, [time]);

    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <GlassPanel variant="hero" className="w-full relative overflow-hidden group">
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-r from-accent/30 to-accent-2/10"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 p-4 md:p-6">
                <div className="flex-1 text-center md:text-left min-w-0">
                    <div className="mb-4 flex flex-col md:flex-row md:items-end gap-2 md:gap-4">
                        <div className="flex items-center justify-center md:justify-start gap-3">
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{greeting}</span>
                                <span className="ml-2 text-sm font-semibold text-white/90">{userName || "Pilot"}</span>
                            </div>
                            <div className="text-xl font-mono font-bold text-accent tracking-tighter tabular-nums opacity-80 decoration-accent/30 underline underline-offset-4">
                                {timeString}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-2/80">Command Directive</span>
                        {tasksRemaining > 1 && (
                            <span className="text-[10px] bg-white/5 text-white/50 px-2 py-0.5 rounded-md border border-white/5 font-bold">
                                + {tasksRemaining - 1} QUEUED
                            </span>
                        )}
                    </div>

                    <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tighter text-white mb-3 leading-[1.1]">
                        {isClosed ? "Operations Finalized 🔒" : (topTask ? topTask.text : "Awaiting Strategy.")}
                    </h2>

                    <div className="text-sm text-muted/80 font-bold flex items-center justify-center md:justify-start gap-2 uppercase tracking-widest">
                        {topTask ? (
                            <>
                                <span className="w-4 h-[1px] bg-white/20"></span>
                                {topTask.projectName}
                            </>
                        ) : (
                            "SYSTEM IDLE — PREPARE NEXT MOVE"
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3 flex-shrink-0 w-full md:w-auto">
                    {topTask && !isClosed && (
                        <button
                            className="w-full md:w-auto hover-lift relative overflow-hidden rounded-xl bg-white text-black font-bold text-lg px-10 py-5 flex items-center justify-center gap-3 transition shadow-[0_0_50px_rgba(255,255,255,0.1)] hover:shadow-[0_0_70px_rgba(255,255,255,0.2)] active:scale-95"
                            onClick={() => onStartFocus(topTask.id)}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-accent-2/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                            <span className="relative z-10 uppercase tracking-tighter">Initiate Focus</span>
                        </button>
                    )}

                    <button
                        onClick={onToggleClosed}
                        className={`w-full md:w-auto text-[10px] font-black uppercase tracking-[0.3em] px-5 py-2.5 rounded-lg border transition-all ${isClosed
                            ? "bg-accent/10 border-accent/30 text-accent shadow-[0_0_20px_rgba(93,216,255,0.1)]"
                            : "bg-white/5 border-white/10 text-muted/60 hover:text-white hover:bg-white/10 hover:border-white/20"
                            }`}
                    >
                        {isClosed ? "Open Cycle" : "Finalize Cycle"}
                    </button>
                </div>
            </div>
        </GlassPanel>
    );
}
