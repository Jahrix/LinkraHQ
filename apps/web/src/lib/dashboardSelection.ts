import type { Project } from "@linkra/shared";

export const resolveProjectSelection = (
  visibleProjects: Project[],
  selectedProjectId: string | null,
  forcedProjectId?: string | null
) => {
  if (!visibleProjects.length) {
    return {
      selectedProjectId: null,
      selectedProject: null
    };
  }

  if (forcedProjectId) {
    const forcedProject = visibleProjects.find((project) => project.id === forcedProjectId) ?? null;
    if (forcedProject) {
      return {
        selectedProjectId: forcedProject.id,
        selectedProject: forcedProject
      };
    }
  }

  const selectedProject = selectedProjectId
    ? visibleProjects.find((project) => project.id === selectedProjectId) ?? null
    : null;

  if (selectedProject) {
    return {
      selectedProjectId: selectedProject.id,
      selectedProject
    };
  }

  return {
    selectedProjectId: visibleProjects[0].id,
    selectedProject: visibleProjects[0]
  };
};
