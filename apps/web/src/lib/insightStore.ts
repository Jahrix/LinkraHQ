import { type Insight, type SuggestedAction, type Project, type LocalRepo } from "@linkra/shared";

export type InsightGroup = {
    key: string;
    ruleId: string;
    projectId: string | null;
    repoId: string | null;
    title: string;
    reason: string;
    severity: "info" | "warn" | "crit";
    items: Insight[];
    actions: SuggestedAction[];
};

export function severityRank(level: "info" | "warn" | "crit") {
    if (level === "crit") return 2;
    if (level === "warn") return 1;
    return 0;
}

export function successMessageForInsightAction(type: SuggestedAction["type"]) {
    switch (type) {
        case "CREATE_TASK":
            return "Task created.";
        case "SCHEDULE_FOCUS":
            return "Focus session scheduled.";
        case "MOVE_ROADMAP_NOW":
        case "MOVE_ROADMAP_CARD":
            return "Roadmap card updated.";
        case "COPY_REPO_PATH":
            return "Repo path copied.";
        case "OPEN_REPO":
            return "Open repo requested.";
        case "SNOOZE_1D":
            return "Insight snoozed for 1 day.";
        case "SNOOZE_1W":
            return "Insight snoozed for 1 week.";
        case "CREATE_JOURNAL":
            return "Journal entry added.";
        case "DISMISS":
            return "Insight dismissed.";
        default:
            return "Insight action applied.";
    }
}

export function formatInsightMetrics(items: Insight[]) {
    const metrics = items.flatMap((item) => Object.entries(item.metrics ?? {}));
    if (!metrics.length) {
        return [["Reason", items[0]?.reason ?? "No additional metrics"]];
    }

    const grouped = new Map<string, string[]>();
    for (const [key, rawValue] of metrics) {
        const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
        const display =
            typeof rawValue === "number"
                ? Number.isInteger(rawValue)
                    ? `${rawValue}`
                    : rawValue.toFixed(1)
                : Array.isArray(rawValue)
                    ? rawValue.join(", ")
                    : typeof rawValue === "object" && rawValue !== null
                        ? JSON.stringify(rawValue)
                        : String(rawValue);
        const list = grouped.get(label) ?? [];
        if (!list.includes(display)) {
            list.push(display);
            grouped.set(label, list);
        }
    }

    return Array.from(grouped.entries()).map(([label, values]) => [label, values.join(" · ")]);
}

export function defaultInsightActions(insight: Insight): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    actions.push({
        id: `${insight.id}-task`,
        type: "CREATE_TASK",
        label: "Create Task",
        payload: {
            projectId: insight.projectId ?? null,
            title: `Follow up: ${insight.title}`
        }
    });
    actions.push({
        id: `${insight.id}-focus`,
        type: "SCHEDULE_FOCUS",
        label: "Schedule Focus",
        payload: {
            projectId: insight.projectId ?? null,
            reason: insight.title,
            minutes: 45
        }
    });
    if (insight.projectId) {
        actions.push({
            id: `${insight.id}-roadmap`,
            type: "MOVE_ROADMAP_NOW",
            label: "Move Roadmap Card to Now",
            payload: {
                projectId: insight.projectId
            }
        });
    }
    actions.push({
        id: `${insight.id}-copy`,
        type: "COPY_REPO_PATH",
        label: "Copy Repo Path",
        payload: { repoId: insight.repoId ?? null, projectId: insight.projectId ?? null }
    });
    actions.push({
        id: `${insight.id}-snooze-1d`,
        type: "SNOOZE_1D",
        label: "Snooze 1 day",
        payload: { insightId: insight.id }
    });
    actions.push({
        id: `${insight.id}-snooze-1w`,
        type: "SNOOZE_1W",
        label: "Snooze 1 week",
        payload: { insightId: insight.id }
    });
    return actions;
}

export function dedupeInsightActions(actions: SuggestedAction[], insight: Insight) {
    const map = new Map<string, SuggestedAction>();
    for (const action of actions) {
        const payload =
            action.type === "SNOOZE_1D" || action.type === "SNOOZE_1W"
                ? { ...action.payload, insightId: action.payload.insightId ?? insight.id }
                : action.payload;
        const normalized = { ...action, payload };
        const key = `${normalized.type}:${JSON.stringify(normalized.payload ?? {})}`;
        if (!map.has(key)) {
            map.set(key, normalized);
        }
    }
    return Array.from(map.values()).sort((a, b) => insightActionPriority(a.type) - insightActionPriority(b.type));
}

export function insightActionPriority(type: SuggestedAction["type"]) {
    switch (type) {
        case "CREATE_TASK":
            return 0;
        case "SCHEDULE_FOCUS":
            return 1;
        case "MOVE_ROADMAP_NOW":
            return 2;
        case "MOVE_ROADMAP_CARD":
            return 3;
        case "OPEN_REPO":
            return 4;
        case "COPY_REPO_PATH":
            return 5;
        case "CREATE_JOURNAL":
            return 6;
        case "SNOOZE_1D":
            return 7;
        case "SNOOZE_1W":
            return 8;
        default:
            return 9;
    }
}

export function groupInsights(list: Insight[]): InsightGroup[] {
    const map = new Map<string, InsightGroup>();
    for (const insight of list) {
        const key = `${insight.ruleId}:${insight.projectId ?? "none"}:${insight.repoId ?? "none"}`;
        const existing = map.get(key);
        const suggestedActions = dedupeInsightActions(
            insight.suggestedActions.length ? insight.suggestedActions : defaultInsightActions(insight),
            insight
        );
        if (!existing) {
            map.set(key, {
                key,
                ruleId: insight.ruleId,
                projectId: insight.projectId ?? null,
                repoId: insight.repoId ?? null,
                title: insight.title,
                reason: insight.reason,
                severity: insight.severity,
                items: [insight],
                actions: [...suggestedActions]
            });
        } else {
            existing.items.push(insight);
            existing.actions = dedupeInsightActions([...existing.actions, ...suggestedActions], insight);
            if (severityRank(insight.severity) > severityRank(existing.severity)) {
                existing.severity = insight.severity;
            }
            if (!existing.projectId && insight.projectId) existing.projectId = insight.projectId;
            if (!existing.repoId && insight.repoId) existing.repoId = insight.repoId;
        }
    }
    return Array.from(map.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function resolveRepoPath(
    group: InsightGroup,
    selectedProject: Project | null,
    repoById: Map<string, LocalRepo>,
    repoByPath: Map<string, LocalRepo>
) {
    if (group.repoId) {
        const byId = repoById.get(group.repoId);
        if (byId) return byId.path;
    }
    if (selectedProject?.localRepoPath && repoByPath.get(selectedProject.localRepoPath)) {
        return selectedProject.localRepoPath;
    }
    return null;
}
