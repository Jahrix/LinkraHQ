export type InsightRuleConfig = {
  id: string;
  title: string;
  description: string;
  defaultEnabled: boolean;
  severity: "info" | "warn" | "crit";
  settings?: Record<string, number | string>;
};

export const insightRules: InsightRuleConfig[] = [
  {
    id: "STALE_REPO",
    title: "Repo looks stale",
    description: "No commits in the last X days.",
    defaultEnabled: true,
    severity: "warn",
    settings: { days: 7 }
  },
  {
    id: "DEAD_WEIGHT",
    title: "Project is dead weight",
    description: "Project untouched for X days. Consider archiving.",
    defaultEnabled: true,
    severity: "crit",
    settings: { days: 14 }
  },
  {
    id: "DIRTY_DEBT",
    title: "Working tree has been dirty too long",
    description: "Repo has uncommitted changes for X days.",
    defaultEnabled: true,
    severity: "warn",
    settings: { days: 3 }
  },
  {
    id: "OVERDUE_TASKS",
    title: "Overdue tasks detected",
    description: "Tasks past due date exist.",
    defaultEnabled: true,
    severity: "warn",
    settings: { threshold: 1 }
  },
  {
    id: "NO_NOW_ROADMAP",
    title: "Nothing in Now lane",
    description: "Roadmap has no cards in Now.",
    defaultEnabled: true,
    severity: "info"
  },
  {
    id: "LOW_LOCKIN",
    title: "Lock‑in score is low",
    description: "Today’s score is below threshold by 6pm.",
    defaultEnabled: true,
    severity: "warn",
    settings: { threshold: 50 }
  },
  {
    id: "SCAN_STALE",
    title: "Local git scan is stale",
    description: "Last scan older than interval * 2.",
    defaultEnabled: true,
    severity: "warn"
  }
];
