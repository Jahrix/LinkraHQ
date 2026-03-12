export function createBuildPlanPrompt(state, prompt = "", now = new Date(), candidateTaskIds) {
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);
    const taskFilter = candidateTaskIds ? new Set(candidateTaskIds) : null;
    const activeProjects = state.projects.filter((project) => project.status !== "Archived");
    const tasks = activeProjects.flatMap((project) => project.tasks
        .filter((task) => !task.done && (!taskFilter || taskFilter.has(task.id)))
        .map((task) => ({
        id: task.id,
        text: task.text,
        project: project.name,
        priority: task.priority,
        dueDate: task.dueDate ?? null,
        isOverdue: task.dueDate ? task.dueDate < today : false,
        status: task.status
    })));
    const roadmapNow = state.roadmapCards
        .filter((card) => card.lane === "now")
        .map((card) => card.title)
        .slice(0, 5);
    const activeInsights = state.insights
        .filter((insight) => !insight.dismissedUntil || insight.dismissedUntil < nowIso)
        .filter((insight) => insight.severity !== "info")
        .map((insight) => `${insight.title}: ${insight.reason}`)
        .slice(0, 5);
    const localRepos = (state.localRepos ?? []).map((repo) => ({
        name: repo.name,
        dirty: repo.dirty,
        untrackedCount: repo.untrackedCount,
        todayCommitCount: repo.todayCommitCount,
        ahead: repo.ahead,
        behind: repo.behind
    }));
    const contextSummary = {
        date: today,
        projects: activeProjects.map((project) => ({
            name: project.name,
            status: project.status,
            weeklyHours: project.weeklyHours,
            tasksTotal: project.tasks.length,
            tasksDone: project.tasks.filter((task) => task.done).length
        })),
        tasks: tasks.slice(0, 30),
        roadmapNowItems: roadmapNow,
        activeSignals: activeInsights,
        localRepos: localRepos.slice(0, 10)
    };
    const systemPrompt = `You are an elite personal command center for a developer. Your job: generate the best possible daily work plan.

Rules:
- Return exactly a JSON object: { "taskIds": string[], "rationale": string }
- taskIds: 4-6 task IDs from the provided list only. Max 6.
- rationale: 1-2 tight sentences. Confident tone. No hedging. Example: "These moves will ship visible progress on your highest-priority work today."
- If the user provides specific "User guidance" below, PRIORITIZE tasks that align with that guidance above all other heuristics.
- Do not include done tasks. Do not invent tasks.
- Return only valid JSON, no markdown fences.

Priority order (highest to lowest):
1. Overdue tasks (isOverdue: true) — these must ship
2. High-priority tasks in active "In Progress" projects
3. Tasks aligned to roadmap "Now" items
4. Tasks from projects with active signals or warnings
5. Tasks from projects with the most weekly hours invested
6. Unblocked tasks that visibly advance a project (over cleanup or filler)

Avoid:
- Generic maintenance unless it unblocks real work
- Tasks from On Hold or Done projects
- Stuffing the plan with low-value items just to fill slots`;
    const userMessage = `Today is ${today}. Here is my work context:
${JSON.stringify(contextSummary, null, 2)}

Build my plan. ${prompt.trim() ? `User guidance for today: "${prompt}"` : ""}
Return JSON only: {"taskIds": [...], "rationale": "..."}`;
    return {
        today,
        tasks,
        systemPrompt,
        userMessage
    };
}
export function parseBuildPlanResponse(rawText, validTaskIds) {
    const cleaned = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.taskIds) || typeof parsed.rationale !== "string") {
        throw new Error("Unexpected response shape from Claude");
    }
    const validIds = new Set(validTaskIds);
    const filteredIds = parsed.taskIds
        .filter((taskId) => typeof taskId === "string" && validIds.has(taskId))
        .slice(0, 6);
    if (filteredIds.length === 0) {
        throw new Error("Plan generation returned no valid tasks");
    }
    return {
        taskIds: filteredIds,
        rationale: parsed.rationale
    };
}
