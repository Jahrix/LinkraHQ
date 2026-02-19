import type { ProjectTask } from "@linkra/shared";

export function isTaskBlocked(task: ProjectTask, tasks: ProjectTask[]) {
  return task.dependsOnIds.some((id) => !tasks.find((t) => t.id === id)?.done);
}

export function computeTodayPlan(
  taskList: Array<{ task: ProjectTask; projectName: string }>,
  options?: { boostProjectNames?: string[] }
) {
  const boost = new Set(options?.boostProjectNames ?? []);
  return taskList
    .filter(({ task }) => !task.done)
    .map(({ task, projectName }) => ({
      taskId: task.id,
      score:
        (task.priority === "high" ? 3 : task.priority === "med" ? 2 : 1) +
        (task.dueDate ? 2 : 0) +
        (boost.has(projectName) ? 2 : 0),
      label: `${projectName}: ${task.text}`
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map((item) => item.taskId);
}
