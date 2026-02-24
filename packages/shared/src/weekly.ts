import { type AppState, type WeeklyReview } from "./schema.js";
import { todayKey } from "./utils.js";

function weekBounds(weekStart: string) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

function isBetween(dateStr: string, start: string, end: string) {
  return dateStr >= start && dateStr <= end;
}

export function generateWeeklyReview(state: AppState, weekStart: string): WeeklyReview {
  const { weekEnd } = weekBounds(weekStart);
  const now = new Date().toISOString();

  const dailyEntries = Object.values(state.dailyGoalsByDate).filter((entry) =>
    isBetween(entry.date, weekStart, weekEnd)
  );
  const goalsCompleted = dailyEntries.reduce(
    (sum, entry) => sum + entry.goals.filter((g) => g.done).length,
    0
  );
  const points = dailyEntries.reduce((sum, entry) => sum + entry.completedPoints, 0);

  const tasksDone = state.projects.reduce((sum, project) => {
    return (
      sum +
      project.tasks.filter(
        (task) => task.completedAt && isBetween(task.completedAt.slice(0, 10), weekStart, weekEnd)
      ).length
    );
  }, 0);
  const tasksCreated = state.projects.reduce((sum, project) => {
    return (
      sum +
      project.tasks.filter((task) => isBetween(task.createdAt.slice(0, 10), weekStart, weekEnd)).length
    );
  }, 0);

  const roadmapMoved = state.roadmapCards.filter((card) => {
    return card.updatedAt >= `${weekStart}T00:00:00.000Z` && card.updatedAt <= `${weekEnd}T23:59:59.999Z`;
  }).length;

  const commitsCount = state.localRepos.reduce((sum, repo) => sum + repo.todayCommitCount, 0);
  const focusMinutes = state.focusSessions.reduce((sum, session) => {
    return isBetween(session.startedAt.slice(0, 10), weekStart, weekEnd)
      ? sum + session.durationMinutes
      : sum;
  }, 0);
  const journalCount = state.journalEntries.filter((entry) =>
    isBetween(entry.ts.slice(0, 10), weekStart, weekEnd)
  ).length;

  const streakDelta = dailyEntries.filter((entry) => entry.score >= 80).length;

  const perProject = state.projects.map((project) => {
    const repo = state.localRepos.find((item) => item.path === project.localRepoPath);
    return {
      projectId: project.id,
      projectName: project.name,
      tasksDone: project.tasks.filter(
        (task) => task.completedAt && isBetween(task.completedAt.slice(0, 10), weekStart, weekEnd)
      ).length,
      tasksCreated: project.tasks.filter((task) =>
        isBetween(task.createdAt.slice(0, 10), weekStart, weekEnd)
      ).length,
      commitsCount: repo?.todayCommitCount ?? 0,
      focusMinutes: state.focusSessions
        .filter(
          (session) =>
            session.projectId === project.id &&
            isBetween(session.startedAt.slice(0, 10), weekStart, weekEnd)
        )
        .reduce((sum, session) => sum + session.durationMinutes, 0),
      journalCount: state.journalEntries.filter(
        (entry) => entry.projectId === project.id && isBetween(entry.ts.slice(0, 10), weekStart, weekEnd)
      ).length
    };
  });

  const topProject = [...perProject].sort(
    (a, b) => b.tasksDone + b.commitsCount - (a.tasksDone + a.commitsCount)
  )[0];

  const highlights = [
    `${goalsCompleted} goals completed`,
    `${tasksDone} tasks done`,
    `${roadmapMoved} roadmap moves`,
    topProject ? `${topProject.projectName} led with ${topProject.tasksDone} completed tasks` : "No top project yet"
  ];

  const markdown = [
    `# Weekly Review (${weekStart} → ${weekEnd})`,
    ``,
    `**Highlights**`,
    `- ${highlights.join("\n- ")}`,
    ``,
    `**Stats**`,
    `- Goals completed: ${goalsCompleted}`,
    `- Points earned: ${points}`,
    `- Tasks done: ${tasksDone}`,
    `- Tasks created: ${tasksCreated}`,
    `- Roadmap moved: ${roadmapMoved}`,
    `- Commits: ${commitsCount}`,
    `- Focus minutes: ${focusMinutes}`,
    `- Journal entries: ${journalCount}`,
    `- Streak delta: ${streakDelta}`,
    ``,
    `Generated: ${todayKey()}`
  ].join("\n");

  return {
    id: crypto.randomUUID(),
    weekStart,
    weekEnd,
    stats: {
      goalsCompleted,
      points,
      tasksDone,
      tasksCreated,
      roadmapMoved,
      commitsCount,
      focusMinutes,
      journalCount,
      streakDelta
    },
    perProject,
    highlights,
    markdown,
    createdAt: now,
    closedAt: null
  };
}
