import type { ProjectTask } from "@linkra/shared";

export function isTaskBlocked(task: ProjectTask, tasks: ProjectTask[]) {
  return task.dependsOnIds.some((id) => !tasks.find((t) => t.id === id)?.done);
}

export function computeTodayPlan(
  taskList: Array<{
    task: ProjectTask;
    projectId: string;
    projectName: string;
    weeklyHours: number;
    projectTaskList?: ProjectTask[];
  }>,
  options?: {
    boostProjectIds?: string[];
    roadmapNowProjectIds?: string[];
    roadmapNowTaskIds?: string[];
    insightProjectIds?: string[];
    maxTasks?: number;
  }
) {
  const boost = new Set(options?.boostProjectIds ?? []);
  const roadmapNowProjects = new Set(options?.roadmapNowProjectIds ?? []);
  const roadmapNow = new Set(options?.roadmapNowTaskIds ?? []);
  const insightProjects = new Set(options?.insightProjectIds ?? []);
  const maxTasks = Math.min(7, Math.max(3, options?.maxTasks ?? 5));
  const now = Date.now();
  const highestWeeklyHours = taskList.reduce((max, item) => Math.max(max, item.weeklyHours), 0);

  return taskList
    .filter(({ task }) => !task.done)
    .map(({ task, projectId, projectName, weeklyHours, projectTaskList }) => {
      const dueAt = task.dueDate ? new Date(task.dueDate).getTime() : null;
      const isOverdue = dueAt !== null && dueAt < now;
      const isDueSoon = dueAt !== null && dueAt >= now && dueAt - now <= 2 * 24 * 60 * 60 * 1000;
      const weeklyWeight =
        highestWeeklyHours > 0 ? Math.round((Math.max(0, weeklyHours) / highestWeeklyHours) * 18) : 0;
      const blocked = projectTaskList ? isTaskBlocked(task, projectTaskList) : false;
      const createdAt = new Date(task.createdAt).getTime();
      const ageWeight = Number.isNaN(createdAt)
        ? 0
        : Math.min(8, Math.max(0, Math.floor((now - createdAt) / (24 * 60 * 60 * 1000))));

      return {
        taskId: task.id,
        score:
          (task.priority === "high" ? 32 : task.priority === "med" ? 18 : 8) +
          (task.status === "doing" ? 10 : 0) +
          (task.dueDate ? 8 : 0) +
          (isOverdue ? 34 : 0) +
          (isDueSoon ? 14 : 0) +
          (boost.has(projectId) ? 18 : 0) +
          (roadmapNowProjects.has(projectId) ? 16 : 0) +
          (insightProjects.has(projectId) ? 12 : 0) +
          (roadmapNow.has(task.id) ? 22 : 0) +
          weeklyWeight +
          ageWeight -
          (blocked ? 16 : 0),
        dueAt: dueAt ?? Number.POSITIVE_INFINITY,
        createdAt: Number.isNaN(createdAt) ? Number.POSITIVE_INFINITY : createdAt,
        label: `${projectName}: ${task.text}`
      };
    })
    .sort((a, b) => b.score - a.score || a.dueAt - b.dueAt || a.createdAt - b.createdAt || a.label.localeCompare(b.label))
    .slice(0, maxTasks)
    .map((item) => item.taskId);
}
