import { DailyGoalsEntry, Goal, STREAK_THRESHOLD } from "./schema";

export function todayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computeGoalMetrics(goals: Goal[]): {
  completedPoints: number;
  score: number;
} {
  const totalPoints = goals.reduce((sum, goal) => sum + goal.points, 0);
  const completedPoints = goals
    .filter((goal) => goal.done)
    .reduce((sum, goal) => sum + goal.points, 0);
  const score = totalPoints === 0 ? 0 : Math.round((completedPoints / totalPoints) * 100);
  return { completedPoints, score };
}

export function computeStreak(entries: DailyGoalsEntry[]): number {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  let streak = 0;
  for (const entry of sorted) {
    if (entry.completedPoints >= STREAK_THRESHOLD) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}
