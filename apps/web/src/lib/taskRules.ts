import type { ProjectTask } from "@linkra/shared";

export function isTaskBlocked(task: ProjectTask, tasks: ProjectTask[]) {
  return task.dependsOnIds.some((id) => !tasks.find((t) => t.id === id)?.done);
}

export function computeTodayPlan(
  taskList: Array<{ task: ProjectTask; projectName: string }>,
  options?: { boostProjectNames?: string[]; roadmapNowTaskIds?: string[]; maxTasks?: number }
) {
  const boost = new Set(options?.boostProjectNames ?? []);
  const roadmapNow = new Set(options?.roadmapNowTaskIds ?? []);
  const maxTasks = Math.min(7, Math.max(3, options?.maxTasks ?? 6));
  const now = Date.now();
  return taskList
    .filter(({ task }) => !task.done)
    .map(({ task, projectName }) => ({
      taskId: task.id,
      score:
        (task.priority === "high" ? 3 : task.priority === "med" ? 2 : 1) +
        (task.dueDate ? 1 : 0) +
        (task.dueDate && new Date(task.dueDate).getTime() < now ? 3 : 0) +
        (boost.has(projectName) ? 2 : 0) +
        (roadmapNow.has(task.id) ? 2 : 0),
      label: `${projectName}: ${task.text}`
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTasks)
    .map((item) => item.taskId);
}
