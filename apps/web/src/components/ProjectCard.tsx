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
            className={`w-full text-left ${s.pad} rounded-xl border transition relative overflow-hidden ${isSelected
                    ? "bg-muted border-strong shadow-lg"
                    : "bg-subtle border-subtle hover:bg-muted"
                } ${isStale ? "opacity-70 saturate-50 hover:opacity-100 hover:saturate-100" : ""}`}
            onClick={onClick}
        >
            {isStale && (
                <div className="absolute top-0 right-0 px-2 py-0.5 bg-red-900/50 text-red-200 text-[9px] uppercase tracking-widest rounded-bl-lg font-bold border-b border-l border-red-500/20">
                    Stale
                </div>
            )}
            <div className={`flex justify-between items-center ${s.gap}`}>
                <span className={`${s.icon} drop-shadow-md`}>{project.icon}</span>
                <span className={`${s.badge} font-semibold text-muted px-2 py-1 rounded bg-black/20 border border-white/5 uppercase tracking-widest`}>
                    {project.weeklyHours}h
                </span>
            </div>
            <div className={`font-bold tracking-tight truncate ${s.name} text-white`}>
                {project.name}
            </div>
            <div className={`mt-1 flex justify-between items-center ${s.meta} text-muted font-medium`}>
                <span className="truncate">{project.status}</span>
                <span>
                    {tasksDone}/{tasksTotal} done
                </span>
            </div>
        </button>
    );
}
