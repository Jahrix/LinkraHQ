import React from "react";
import GlassPanel from "../GlassPanel";
import SectionHeader from "../SectionHeader";
import TaskRow from "../TaskRow";
import ProjectJournalPanel from "../ProjectJournalPanel";
import { type Project, type ProjectTask, type RoadmapCard, type LocalRepo } from "@linkra/shared";

interface ProjectCommandCenterProps {
  project: Project | null;
  tasks: ProjectTask[];
  taskText: string;
  onTaskTextChange: (text: string) => void;
  onAddTask: () => void;
  onToggleTask: (taskId: string, done: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onAutoCompleteFromCommits: () => void;
  onOpenSettings: () => void;
  taskProgress: number;
  roadmapCards: RoadmapCard[];
  journalEntries: any[];
  localRepo: LocalRepo | null;
  commitOptions: any[];
}

export default function ProjectCommandCenter({
  project,
  tasks,
  taskText,
  onTaskTextChange,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAutoCompleteFromCommits,
  onOpenSettings,
  taskProgress,
  roadmapCards,
  journalEntries,
  localRepo,
  commitOptions
}: ProjectCommandCenterProps) {
  return (
    <div className="xl:col-span-2 flex flex-col gap-6">
      <GlassPanel variant="standard" className="flex-1 flex flex-col">
        <div className="flex gap-4 items-center mb-6 pb-6 border-b border-subtle">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(255,255,255,0.05)] flex-shrink-0 overflow-hidden border ${project ? "bg-accent/10 border-accent/20" : "bg-white/5 border-white/10"}`}>
            {project?.logoUrl ? (
              <img src={project.logoUrl} alt={project.name} className="w-full h-full object-cover" />
            ) : (
              <span className="opacity-80">{project?.icon ?? "🧠"}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-2xl tracking-tighter truncate text-white uppercase italic">
              {project?.name ?? "Executive Briefing"}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate font-black uppercase tracking-[0.2em] opacity-60">
              {project?.subtitle ?? "Unified Project Intelligence"}
            </p>
          </div>
          <div className="flex gap-8 text-center shrink-0 items-center pr-2">
            <div>
              <strong className="block text-2xl font-bold mb-1">{project?.tasks.length ?? 0}</strong>
              <span className="text-muted text-[10px] uppercase tracking-[0.2em] font-bold">Tasks</span>
            </div>
            <div>
              <strong className="block text-2xl font-bold mb-1 text-emerald-400">{taskProgress}%</strong>
              <span className="text-emerald-500/70 text-[10px] uppercase tracking-[0.2em] font-bold">Done</span>
            </div>
            {project && (
              <button className="button-secondary p-2 ml-2" onClick={onOpenSettings} aria-label="Project Settings">
                <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <SectionHeader
          title="Tasks"
          rightControls={
            <button
              onClick={onAutoCompleteFromCommits}
              className="text-[10px] uppercase font-bold tracking-widest text-accent hover:text-accent-100 flex items-center gap-1.5"
              title="Scan commits and auto-complete matching tasks"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Auto-Complete
            </button>
          }
        />
        <div className="mt-4 flex-1 grid gap-2 overflow-y-auto pr-2 min-h-[300px]">
          {tasks.length === 0 && <p className="text-sm text-muted flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>No tasks.</p>}
          {tasks.map(task => (
            <TaskRow
              key={task.id}
              text={task.text}
              done={task.done}
              onToggle={(nextValue) => onToggleTask(task.id, nextValue)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-6 mb-6">
          <input
            value={taskText}
            onChange={(e) => onTaskTextChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddTask()}
            placeholder="New task..."
            className="input flex-1 bg-white/5 border-white/5 text-base py-3"
            autoComplete="off"
          />
          <button onClick={onAddTask} className="button-secondary px-6">Add</button>
        </div>

        {project && (
          <div className="mt-2 pt-6 border-t border-subtle">
            <SectionHeader title="Action Log" subtitle="Notes, blockers, ideas" />
            <div className="mt-4">
              <ProjectJournalPanel
                project={project}
                tasks={project.tasks}
                roadmapCards={roadmapCards}
                journalEntries={journalEntries}
                repo={localRepo}
                commitOptions={commitOptions}
              />
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
