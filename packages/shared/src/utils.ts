import { DailyGoalsEntry, Goal, Habit, STREAK_THRESHOLD } from "./schema.js";

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

  // The user requested `score` be purely cumulative of raw points, rather than a completion percentage.
  // We keep `completedPoints` mapped 1:1 so 3 pts = 3 score, not an unexpected 50.
  const score = completedPoints;
  return { completedPoints, score };
}

export function computeStreak(entries: DailyGoalsEntry[]): number {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  let streak = 0;
  let expectedDate: string | null = null;
  for (const entry of sorted) {
    if (expectedDate && entry.date !== expectedDate) {
      break;
    }
    if (entry.completedPoints >= STREAK_THRESHOLD) {
      streak += 1;
      expectedDate = shiftDate(entry.date, -1);
    } else {
      break;
    }
  }
  return streak;
}

function shiftDate(date: string, deltaDays: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setDate(current.getDate() + deltaDays);
  return todayKey(current);
}
// ── Habit Engine helpers ───────────────────────────────────────────────────────

export function computeHabitStreak(completionDates: string[]): number {
  const sorted = [...completionDates].sort().reverse();
  if (!sorted.length) return 0;
  const today = todayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = todayKey(yesterday);
  if (sorted[0] !== today && sorted[0] !== yesterdayStr) return 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function computeHabitBrokenStreak(completionDates: string[]): number | null {
  const sorted = [...completionDates].sort().reverse();
  if (!sorted.length) return null;
  
  const todayStr = todayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = todayKey(yesterday);
  
  const dayBeforeYesterday = new Date();
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
  const dayBeforeYesterdayStr = todayKey(dayBeforeYesterday);

  // If completed today or yesterday, the streak is NOT broken yesterday.
  if (sorted[0] === todayStr || sorted[0] === yesterdayStr) return null;

  // If the most recent completion was exactly the day before yesterday,
  // it means they broke the streak yesterday.
  if (sorted[0] === dayBeforeYesterdayStr) {
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    // Only return broken streak if it was >= 3 or something? No, any streak > 0 is fine.
    return streak;
  }
  return null;
}

export function isHabitDueToday(habit: Habit): boolean {
  const day = new Date().getDay();
  if (habit.frequency === "daily") return true;
  if (habit.frequency === "weekdays") return day >= 1 && day <= 5;
  if (habit.frequency === "custom") return habit.customDays.includes(day);
  return false;
}

export function normalizeRepo(repoStr: string | null | undefined): string {
  if (!repoStr) return "";
  let clean = repoStr.trim();
  // Remove protocol and domain if present
  clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//, "");
  // Remove .git suffix
  clean = clean.replace(/\.git$/, "");
  // Remove trailing slash
  clean = clean.replace(/\/$/, "");
  return clean;
}

export function computeDecay(
  dailyGoalsByDate: Record<string, DailyGoalsEntry>
): number {
  // Only decay after 2+ consecutive completely inactive days
  // Max decay: -15 (3 decaying days * 5)
  let consecutiveInactiveDays = 0

  for (let i = 1; i <= 5; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const entry = dailyGoalsByDate[key]
    const wasActive = entry && (
      entry.score > 0 ||
      entry.goals.some(g => g.done)
    )
    if (!wasActive) {
      consecutiveInactiveDays++
    } else {
      break
    }
  }

  // Only start decaying after 2 full inactive days
  const decayDays = Math.max(0, consecutiveInactiveDays - 1)
  return -(Math.min(decayDays, 3) * 5)  // max -15
}

