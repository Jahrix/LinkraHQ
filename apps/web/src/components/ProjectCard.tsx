import React from "react";
import { type Project } from "@linkra/shared";

export default function ProjectCard({
    project,
    isSelected,
    onClick
}: {
    project: Project;
    isSelected?: boolean;
    onClick?: () => void;
}) {
    const tasksDone = project.tasks.filter((task) => task.done).length;
    const tasksTotal = project.tasks.length;
    const isStale =
        project.status !== "Archived" &&
        project.updatedAt &&
        Date.now() - new Date(project.updatedAt).getTime() > 14 * 24 * 60 * 60 * 1000;

    return (
        <button
            className={`text-left p-4 rounded-xl border transition relative overflow-hidden ${isSelected
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
            <div className="flex justify-between items-center mb-3">
                <span className="text-3xl drop-shadow-md">{project.icon}</span>
                <span className="text-[10px] font-semibold text-muted px-2 py-1 rounded bg-black/20 border border-white/5 uppercase tracking-widest">
                    {project.weeklyHours}h
                </span>
            </div>
            <div className="font-bold tracking-tight truncate text-base text-white">
                {project.name}
            </div>
            <div className="mt-1 flex justify-between items-center text-xs text-muted font-medium">
                <span className="truncate">{project.status}</span>
                <span>
                    {tasksDone}/{tasksTotal} done
                </span>
            </div>
        </button>
    );
}
