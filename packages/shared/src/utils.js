import { STREAK_THRESHOLD } from "./schema.js";
export function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
export function computeGoalMetrics(goals) {
    const totalPoints = goals.reduce((sum, goal) => sum + goal.points, 0);
    const completedPoints = goals
        .filter((goal) => goal.done)
        .reduce((sum, goal) => sum + goal.points, 0);
    // The user requested `score` be purely cumulative of raw points, rather than a completion percentage.
    // We keep `completedPoints` mapped 1:1 so 3 pts = 3 score, not an unexpected 50.
    const score = completedPoints;
    return { completedPoints, score };
}
export function computeStreak(entries) {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
    let streak = 0;
    let expectedDate = null;
    for (const entry of sorted) {
        if (expectedDate && entry.date !== expectedDate) {
            break;
        }
        if (entry.completedPoints >= STREAK_THRESHOLD) {
            streak += 1;
            expectedDate = shiftDate(entry.date, -1);
        }
        else {
            break;
        }
    }
    return streak;
}
function shiftDate(date, deltaDays) {
    const current = new Date(`${date}T00:00:00`);
    current.setDate(current.getDate() + deltaDays);
    return todayKey(current);
}
export function normalizeRepo(repoStr) {
    if (!repoStr)
        return "";
    let clean = repoStr.trim();
    // Remove protocol and domain if present
    clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//, "");
    // Remove .git suffix
    clean = clean.replace(/\.git$/, "");
    // Remove trailing slash
    clean = clean.replace(/\/$/, "");
    return clean;
}
