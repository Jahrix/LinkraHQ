import { type Project, type RoadmapCard } from "@linkra/shared";

export type ProjectDraft = {
    icon: string;
    name: string;
    subtitle: string;
    status: Project["status"];
    weeklyHours: number;
    localRepoPath: string | null;
    remoteRepo: string | null;
    logoUrl: string | null;
};

export function clampWeeklyHours(value: number) {
    return Math.max(0, Math.min(40, value));
}

export function createProjectFromDraft(draft: ProjectDraft, color: string): Project {
    const nowIso = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        name: draft.name.trim(),
        subtitle: draft.subtitle.trim(),
        icon: draft.icon,
        color,
        status: draft.status,
        progress: 0,
        weeklyHours: clampWeeklyHours(Number(draft.weeklyHours) || 0),
        logoUrl: draft.logoUrl || null,
        githubRepo: draft.remoteRepo?.trim() || null,
        remoteRepo: draft.remoteRepo?.trim() || null,
        localRepoPath: draft.localRepoPath || null,
        healthScore: null,
        archivedAt: draft.status === "Archived" ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
        tasks: []
    };
}

export function applyProjectDraftToProject(project: Project, draft: ProjectDraft) {
    const nowIso = new Date().toISOString();
    project.name = draft.name.trim();
    project.subtitle = draft.subtitle.trim();
    project.icon = draft.icon;
    project.status = draft.status;
    project.weeklyHours = clampWeeklyHours(Number(draft.weeklyHours) || 0);
    project.githubRepo = draft.remoteRepo?.trim() || null;
    project.remoteRepo = draft.remoteRepo?.trim() || null;
    project.localRepoPath = draft.localRepoPath || null;
    project.logoUrl = draft.logoUrl || null;
    project.archivedAt = draft.status === "Archived" ? project.archivedAt ?? nowIso : null;
    project.updatedAt = nowIso;
}

export function normalizeRoadmapProjectRefs(cards: RoadmapCard[], project: Project, aliases: string[] = []) {
    const refs = new Set([project.id, project.name, ...aliases]);
    return cards.map((card) => {
        if (!card.project) return card;
        if (refs.has(card.project)) {
            return {
                ...card,
                project: project.id,
                updatedAt: new Date().toISOString()
            };
        }
        return card;
    });
}

export function isArchivedProject(project: Project) {
    return project.status === "Archived";
}

export function resolveRoadmapProject(ref: string | null, projects: Project[]) {
    if (!ref) return null;
    return projects.find((project) => project.id === ref || project.name === ref) ?? null;
}

export function isRoadmapCardForProject(card: RoadmapCard, project: Project | null, projects: Project[]) {
    if (!project || !card.project) return false;
    const ref = resolveRoadmapProject(card.project, projects);
    if (!ref) return card.project === project.name;
    return ref.id === project.id;
}
