import React from "react";
import ProjectCard from "../ProjectCard";
import GlassPanel from "../GlassPanel";
import SectionHeader from "../SectionHeader";
import { type Project } from "@linkra/shared";

interface ProjectRailProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onMoveProject: (idx: number, dir: -1 | 1) => void;
  onNewProject: () => void;
  showArchived: boolean;
}

export default function ProjectRail({
  projects,
  selectedProjectId,
  onSelectProject,
  onMoveProject,
  onNewProject,
  showArchived
}: ProjectRailProps) {
  return (
    <GlassPanel variant="hero" className="mb-6">
      <SectionHeader
        title="Projects"
        subtitle={showArchived ? "All projects" : "Active projects"}
        rightControls={
          <button className="button-secondary" onClick={onNewProject}>+ New</button>
        }
      />
      <div className={`mt-5 grid gap-4 ${projects.length === 1 ? "grid-cols-1 sm:grid-cols-2" :
        projects.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
          projects.length === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
            "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        }`}>
        {projects.map((project, idx) => (
          <div key={project.id} className="relative group/card">
            <ProjectCard
              project={project}
              isSelected={selectedProjectId === project.id}
              onClick={() => onSelectProject(project.id)}
              size={projects.length <= 2 ? "lg" : projects.length <= 3 ? "md" : "sm"}
            />
            <div className="absolute top-1/2 -translate-y-1/2 left-1 right-1 flex justify-between pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity">
              {idx > 0 ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveProject(idx, -1); }}
                  className="p-1 rounded-full bg-black/80 hover:bg-white text-muted hover:text-black transition-all pointer-events-auto shadow-xl border border-white/10"
                  title="Move left"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
              ) : <div />}
              {idx < projects.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveProject(idx, 1); }}
                  className="p-1 rounded-full bg-black/80 hover:bg-white text-muted hover:text-black transition-all pointer-events-auto shadow-xl border border-white/10"
                  title="Move right"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
