import React from "react";
import { type Project } from "@linkra/shared";

export type CardSize = "lg" | "md" | "sm";

const sizeStyles: Record<CardSize, { pad: string; icon: string; name: string; meta: string; badge: string; gap: string }> = {
    lg: { pad: "p-6", icon: "text-5xl", name: "text-xl", meta: "text-sm", badge: "text-xs", gap: "mb-4" },
    md: { pad: "p-5", icon: "text-4xl", name: "text-lg", meta: "text-xs", badge: "text-[11px]", gap: "mb-3" },
    sm: { pad: "p-4", icon: "text-3xl", name: "text-base", meta: "text-xs", badge: "text-[10px]", gap: "mb-3" },
};

export default function ProjectCard({
    project,
    isSelected,
    onClick,
    size = "sm"
}: {
    project: Project;
    isSelected?: boolean;
    onClick?: () => void;
    size?: CardSize;
}) {
    const tasksDone = project.tasks.filter((task) => task.done).length;
    const tasksTotal = project.tasks.length;
    const isStale =
        project.status !== "Archived" &&
        project.updatedAt &&
        Date.now() - new Date(project.updatedAt).getTime() > 14 * 24 * 60 * 60 * 1000;
    const s = sizeStyles[size];

    return (
        <button
            className={`w-full text-left ${s.pad} rounded-2xl border transition-all duration-300 relative overflow-hidden group ${isSelected
                ? "bg-white/[0.06] border-white/20 shadow-[0_0_40px_rgba(255,255,255,0.05)] scale-[1.02] z-10"
                : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"
                } ${isStale ? "opacity-60 saturate-[0.25]" : ""}`}
            onClick={onClick}
        >
            {isStale && (
                <div className="absolute top-0 right-0 px-2 py-0.5 bg-red-500/10 text-red-400 text-[8px] uppercase tracking-[0.2em] rounded-bl-lg font-black border-b border-l border-red-500/20 backdrop-blur-md">
                    Inactive
                </div>
            )}

            <div className={`flex justify-between items-start ${s.gap}`}>
                <div className={`${s.icon} drop-shadow-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110`}>
                    {project.logoUrl ? (
                        <div className="relative">
                            <div className={`absolute inset-0 bg-white/10 blur-xl rounded-full transition-opacity duration-500 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                            <img src={project.logoUrl} alt="" className="w-[1.1em] h-[1.1em] object-contain relative z-10" />
                        </div>
                    ) : (
                        <span className="opacity-90">{project.icon}</span>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`${s.badge} font-black text-white/30 px-2 py-0.5 rounded-md bg-white/5 border border-white/5 uppercase tracking-widest`}>
                        {project.weeklyHours}H
                    </span>
                </div>
            </div>

            <div className={`font-bold tracking-tight truncate ${s.name} text-white/90 group-hover:text-white transition-colors`}>
                {project.name}
            </div>

            <div className={`mt-1.5 flex justify-between items-center ${s.meta} font-bold tracking-wide`}>
                <span className="text-white/20 uppercase text-[9px] tracking-[0.2em] truncate mr-2">{project.status}</span>
                <span className="text-accent underline decoration-accent/20 underline-offset-4 decoration-2">
                    {tasksDone} / {tasksTotal}
                </span>
            </div>

            {isSelected && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            )}
        </button>
    );
}
