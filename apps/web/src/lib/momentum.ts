import { type AppState, todayKey } from "@linkra/shared";

export interface MomentumHistory {
  date: string;
  score: number;
}

export function calculateMomentum(state: AppState, habitCompletedCount: number = 0, totalActiveHabits: number = 0): {
  score: number;
  dailyGoalProgress: number;
  roadmapProgress: number;
  habitsProgress: number;
  streak: number;
  history: MomentumHistory[];
} {
  const dates: string[] = [];
  const now = new Date();
  
  // Calculate for last 14 days
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(todayKey(d));
  }

  const history: MomentumHistory[] = dates.map((date) => {
    let score = 0;
    
    // 1. Daily Goals (40% weight)
    const daily = state.dailyGoalsByDate[date];
    if (daily && daily.goals.length > 0) {
      score += (daily.score / 100) * 40;
    }

    // 2. Roadmap / Project Momentum (30% weight)
    // We count "shipped" cards as a proxy for velocity.
    const shippedToday = state.roadmapCards
      .filter((c) => c.lane === "shipped")
      .filter((c) => c.updatedAt?.startsWith(date))
      .length;
    
    if (shippedToday > 0) {
      score += 30; // 30 points if anything shipped today
    } else {
      // Small bonus if there are at least "now" cards active
      const activeCount = state.roadmapCards.filter(c => c.lane === "now").length;
      if (activeCount > 0) score += 5;
    }

    // 3. Habits (30% weight)
    // Since we only have today's habit count from context,
    // we only apply this to the latest date.
    if (date === todayKey(now)) {
      if (totalActiveHabits > 0) {
        const habitScore = (habitCompletedCount / totalActiveHabits) * 30;
        score += habitScore;
      }
    } else {
      // Historical habit data is harder to fetch without full habit history in AppState.
      // Give a small "participation" score for historical days.
      score += 10; 
    }

    return { date, score: Math.min(100, Math.round(score)) };
  });

  const score = history[history.length - 1].score;

  // Progress breakdowns for UI
  const today = todayKey(now);
  const todayDaily = state.dailyGoalsByDate[today];
  const dailyGoalProgress = todayDaily ? todayDaily.score : 0;

  const shippedCount = state.roadmapCards.filter(c => c.lane === "shipped" && c.updatedAt?.startsWith(today)).length;
  const roadmapProgress = shippedCount > 0 ? 100 : (state.roadmapCards.filter(c => c.lane === "now").length > 0 ? 50 : 0);

  const habitsProgress = totalActiveHabits > 0 ? Math.round((habitCompletedCount / totalActiveHabits) * 100) : 0;

  // Streak (Momentum >= 30 for consecutive days)
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].score >= 30) {
      streak++;
    } else if (i === history.length - 1) {
      // Today is < 30, streak is broken
      streak = 0;
      break;
    } else {
      break;
    }
  }

  return {
    score,
    dailyGoalProgress,
    roadmapProgress,
    habitsProgress,
    streak,
    history,
  };
}
