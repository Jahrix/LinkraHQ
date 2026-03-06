import { type AppState, type JournalEntry, type Project, type RoadmapCard, type WeeklyReview } from "./schema.js";
import { todayKey } from "./utils.js";

export function weekBounds(weekStart: string) {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

export function isBetween(dateStr: string | null | undefined, start: string, end: string) {
  if (!dateStr) return false;
  const day = dateStr.slice(0, 10);
  return day >= start && day <= end;
}

function resolveRoadmapProjectId(card: RoadmapCard, projects: Project[]) {
  if (!card.project) return null;
  const byId = projects.find((project) => project.id === card.project);
  if (byId) return byId.id;
  const byName = projects.find((project) => project.name === card.project);
  return byName?.id ?? null;
}

function getJournalEntriesInWeek(entries: JournalEntry[], weekStart: string, weekEnd: string) {
  return entries.filter((entry) => isBetween(entry.ts, weekStart, weekEnd));
}

function collectCommitSignals({
  state,
  weekStart,
  weekEnd,
  projectId
}: {
  state: AppState;
  weekStart: string;
  weekEnd: string;
  projectId?: string;
}) {
  const commitShas = new Set<string>();

  for (const project of state.projects) {
    if (projectId && project.id !== projectId) continue;
    for (const task of project.tasks) {
      if (!task.linkedCommit?.sha) continue;
      const relevantDate = task.completedAt ?? task.createdAt;
      if (isBetween(relevantDate, weekStart, weekEnd)) {
        commitShas.add(task.linkedCommit.sha);
      }
    }
  }

  for (const entry of getJournalEntriesInWeek(state.journalEntries, weekStart, weekEnd)) {
    if (projectId && entry.projectId !== projectId) continue;
    for (const sha of entry.links.commitShas ?? []) {
      if (sha) commitShas.add(sha);
    }
  }

  for (const project of state.projects) {
    if (projectId && project.id !== projectId) continue;
    if (!project.localRepoPath) continue;
    const repo = state.localRepos.find((item) => item.path === project.localRepoPath);
    if (!repo?.lastCommitAt || !isBetween(repo.lastCommitAt, weekStart, weekEnd)) continue;
    const count = weekEnd >= todayKey() ? Math.max(repo.todayCommitCount, 1) : 1;
    for (let index = 0; index < count; index += 1) {
      commitShas.add(`${repo.id}:${repo.lastCommitAt}:${index}`);
    }
  }

  return commitShas.size;
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
      project.tasks.filter((task) => isBetween(task.createdAt, weekStart, weekEnd)).length
    );
  }, 0);

  const roadmapMoved = state.roadmapCards.filter((card) => {
    return isBetween(card.updatedAt, weekStart, weekEnd);
  }).length;

  const commitsCount = collectCommitSignals({ state, weekStart, weekEnd });
  const focusMinutes = state.focusSessions.reduce((sum, session) => {
    return isBetween(session.completedAt ?? session.startedAt, weekStart, weekEnd)
      ? sum + session.durationMinutes
      : sum;
  }, 0);
  const journalEntries = getJournalEntriesInWeek(state.journalEntries, weekStart, weekEnd);
  const journalCount = journalEntries.length;

  const streakDelta = dailyEntries.filter((entry) => entry.score >= 80).length;

  const perProject = state.projects.map((project) => {
    const projectRoadmapMoved = state.roadmapCards.filter((card) => {
      return resolveRoadmapProjectId(card, state.projects) === project.id && isBetween(card.updatedAt, weekStart, weekEnd);
    }).length;

    return {
      projectId: project.id,
      projectName: project.name,
      tasksDone: project.tasks.filter(
        (task) => task.completedAt && isBetween(task.completedAt, weekStart, weekEnd)
      ).length,
      tasksCreated: project.tasks.filter((task) => isBetween(task.createdAt, weekStart, weekEnd)).length,
      commitsCount: collectCommitSignals({ state, weekStart, weekEnd, projectId: project.id }),
      focusMinutes: state.focusSessions
        .filter(
          (session) =>
            session.projectId === project.id &&
            isBetween(session.completedAt ?? session.startedAt, weekStart, weekEnd)
        )
        .reduce((sum, session) => sum + session.durationMinutes, 0),
      journalCount: journalEntries.filter((entry) => entry.projectId === project.id).length,
      roadmapMoved: projectRoadmapMoved,
      activity: 0 // Will be computed in map
    };
  }).map(item => {
    item.activity = item.tasksDone + item.tasksCreated + item.commitsCount + item.journalCount + item.roadmapMoved + Math.floor(item.focusMinutes / 30);
    return item;
  }).sort((a, b) => {
    return b.activity - a.activity;
  });

  const topProject = [...perProject].sort(
    (a, b) =>
      b.tasksDone + b.commitsCount + b.roadmapMoved + Math.floor(b.focusMinutes / 30) - (
        a.tasksDone + a.commitsCount + a.roadmapMoved + Math.floor(a.focusMinutes / 30)
      )
  )[0];

  const blockersLogged = journalEntries.filter((entry) => entry.type === "blocker").length;
  const decisionsLogged = journalEntries.filter((entry) => entry.type === "decision").length;
  const nextStepsLogged = journalEntries.filter((entry) => entry.type === "next").length;

  const highlights = [
    `${goalsCompleted} goals completed`,
    `${tasksDone} tasks done`,
    `${roadmapMoved} roadmap moves`,
    blockersLogged > 0 ? `${blockersLogged} blockers logged and tracked` : `${decisionsLogged} decisions captured`,
    topProject ? `${topProject.projectName} led with ${topProject.tasksDone} completed tasks` : "No top project yet"
  ];

  const shippedProjects = perProject.filter(p => (state.projects.find(x => x.id === p.projectId)?.progress === 100) && p.activity > 0);
  const activeProjects = perProject.filter(p => p.activity > 0 && state.projects.find(x => x.id === p.projectId)?.progress !== 100);
  const stuckProjects = perProject.filter(p => p.activity === 0);

  const renderProjectLines = (project: any) => [
    `### ${project.projectName}`,
    `- Tasks done: ${project.tasksDone}`,
    `- Tasks created: ${project.tasksCreated}`,
    `- Commits linked: ${project.commitsCount}`,
    `- Focus minutes: ${project.focusMinutes}`,
    `- Journal entries: ${project.journalCount}`,
    `- Roadmap moves: ${project.roadmapMoved}`,
    ``
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
    `**Project Breakdown**`,
    ``,
    ...(shippedProjects.length > 0 ? [
      `## Shipped 🟢`,
      ...shippedProjects.flatMap(renderProjectLines)
    ] : []),
    ...(activeProjects.length > 0 ? [
      `## Moved Forward 🔵`,
      ...activeProjects.flatMap(renderProjectLines)
    ] : []),
    ...(stuckProjects.length > 0 ? [
      `## Stuck / Idle 🔴`,
      ...stuckProjects.flatMap(renderProjectLines)
    ] : []),
    ...(perProject.length === 0 ? [`- No project activity logged`, ``] : []),
    `**Review Notes**`,
    `- Decisions captured: ${decisionsLogged}`,
    `- Blockers logged: ${blockersLogged}`,
    `- Next steps logged: ${nextStepsLogged}`,
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
