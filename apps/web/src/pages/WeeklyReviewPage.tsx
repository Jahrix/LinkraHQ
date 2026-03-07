import React, { useEffect, useMemo, useState } from "react";
import { generateWeeklyReview, isBetween, weekBounds, type WeeklyReview } from "@linkra/shared";
import GlassPanel from "../components/GlassPanel";
import Pill from "../components/Pill";
import SectionHeader from "../components/SectionHeader";
import { cloneAppState } from "../lib/appStateModel";
import { dedupeById, dedupeByKey } from "../lib/collections";
import { formatDate } from "../lib/date";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";

function startOfWeek(date: Date) {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

function shiftWeek(weekStart: string, delta: number) {
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + delta * 7);
  return date.toISOString().slice(0, 10);
}

function formatMinutes(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function upsertByWeekStart<T extends { weekStart: string }>(items: T[], nextItem: T) {
  return [nextItem, ...items.filter((item) => item.weekStart !== nextItem.weekStart)];
}

const renderProjectCard = (item: any) => (
  <div key={item.projectId || item.projectName} className="rounded-xl border border-white/5 bg-white/5 p-4 hover:bg-white/10 transition">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-sm font-bold text-white tracking-tight">
          {item.project?.icon ?? "🧩"} {item.projectName}
        </div>
        <div className="mt-1 text-xs text-muted font-medium">
          {item.project?.subtitle || "No subtitle"}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill tone="accent">{item.tasksDone} done</Pill>
        <Pill>{item.tasksCreated} created</Pill>
        <Pill>{item.roadmapMoved} roadmap</Pill>
      </div>
    </div>
    <div className="mt-4 grid gap-2 text-xs text-muted font-mono bg-black/20 p-3 rounded-lg md:grid-cols-3">
      <div>Commits: {item.commitsCount}</div>
      <div>Focus: {formatMinutes(item.focusMinutes)}</div>
      <div>Journal: {item.journalCount}</div>
      <div>Decisions: {item.decisions}</div>
      <div>Blockers: {item.blockers}</div>
      <div>Next steps: {item.nexts}</div>
    </div>
    {item.latestEntry && (
      <div className="mt-3 rounded-lg border border-white/5 bg-black/40 p-3 text-sm text-muted">
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted mb-1 flex items-center gap-2">
          <span>Latest Log</span>
          <span className="opacity-50">•</span>
          <span>{formatDate(item.latestEntry.ts)}</span>
        </div>
        <div className="font-medium text-white/90">
          {item.latestEntry.title || item.latestEntry.type}
        </div>
      </div>
    )}
  </div>
);

export default function WeeklyReviewPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [review, setReview] = useState<WeeklyReview | null>(null);

  if (!state) return null;

  const { weekEnd } = weekBounds(weekStart);
  const liveReview = useMemo(() => generateWeeklyReview(state, weekStart), [state, weekStart]);
  const activeReview = review?.weekStart === weekStart ? review : liveReview;

  const dedupedJournalEntries = dedupeById(state.journalEntries);
  const weekJournalEntries = dedupedJournalEntries.items.filter((entry) => isBetween(entry.ts, weekStart, weekEnd));

  const reviewHistory = useMemo(() => {
    return dedupeByKey(
      [...state.weeklyReviews].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
      (item) => item.weekStart
    );
  }, [state.weeklyReviews]);

  const snapshotHistory = useMemo(() => {
    return dedupeByKey(
      [...state.weeklySnapshots].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
      (item) => item.weekStart
    );
  }, [state.weeklySnapshots]);

  const duplicateWarnings = [
    reviewHistory.duplicates.length > 0
      ? `Weekly review history had ${reviewHistory.duplicates.length} duplicate week entries. The latest week copy is shown.`
      : null,
    snapshotHistory.duplicates.length > 0
      ? `Weekly snapshot history had ${snapshotHistory.duplicates.length} duplicate week entries. The latest week copy is shown.`
      : null,
    dedupedJournalEntries.duplicates.length > 0
      ? `Journal had ${dedupedJournalEntries.duplicates.length} duplicate IDs during recap generation. Counts were deduped.`
      : null
  ].filter((item): item is string => Boolean(item));

  const breakdown = useMemo(() => {
    return activeReview.perProject.map((item) => {
      const project = state.projects.find((candidate) => candidate.id === item.projectId) ?? null;
      const projectEntries = weekJournalEntries.filter((entry) => entry.projectId === item.projectId);
      const blockers = projectEntries.filter((entry) => entry.type === "blocker").length;
      const decisions = projectEntries.filter((entry) => entry.type === "decision").length;
      const nexts = projectEntries.filter((entry) => entry.type === "next").length;
      const latestEntry = [...projectEntries].sort((a, b) => (a.ts < b.ts ? 1 : -1))[0] ?? null;
      const activity =
        item.tasksDone +
        item.tasksCreated +
        item.commitsCount +
        item.journalCount +
        item.roadmapMoved +
        Math.floor(item.focusMinutes / 30);

      return {
        ...item,
        project,
        blockers,
        decisions,
        nexts,
        latestEntry,
        activity
      };
    }).sort((a, b) => b.activity - a.activity);
  }, [activeReview.perProject, state.projects, weekJournalEntries]);

  const statCards = [
    { label: "Goals", value: activeReview.stats.goalsCompleted },
    { label: "Points", value: activeReview.stats.points },
    { label: "Tasks done", value: activeReview.stats.tasksDone },
    { label: "Tasks created", value: activeReview.stats.tasksCreated },
    { label: "Roadmap moves", value: activeReview.stats.roadmapMoved },
    { label: "Commit signals", value: activeReview.stats.commitsCount },
    { label: "Focus", value: formatMinutes(activeReview.stats.focusMinutes) },
    { label: "Journal", value: activeReview.stats.journalCount }
  ];

  useEffect(() => {
    setReview((current) => (current?.weekStart === weekStart ? current : null));
  }, [weekStart]);

  const generateReview = () => {
    setReview(liveReview);
    push("Markdown recap generated.", "success");
  };

  const closeWeek = async () => {
    const nowIso = new Date().toISOString();
    const closedReview: WeeklyReview = {
      ...activeReview,
      createdAt: review?.createdAt ?? nowIso,
      closedAt: nowIso
    };

    const next = cloneAppState(state);
    next.weeklyReviews = upsertByWeekStart(next.weeklyReviews, closedReview);
    next.weeklySnapshots = upsertByWeekStart(next.weeklySnapshots, {
      id: crypto.randomUUID(),
      weekStart: closedReview.weekStart,
      weekEnd: closedReview.weekEnd,
      data: {
        review: closedReview,
        perProject: breakdown.map((item) => ({
          projectId: item.projectId,
          projectName: item.projectName,
          blockers: item.blockers,
          decisions: item.decisions,
          nexts: item.nexts,
          latestEntry: item.latestEntry
            ? {
              id: item.latestEntry.id,
              type: item.latestEntry.type,
              title: item.latestEntry.title,
              ts: item.latestEntry.ts
            }
            : null
        }))
      }
    });

    for (const entry of Object.values(next.dailyGoalsByDate)) {
      if (entry.date >= weekStart && entry.date <= weekEnd) {
        entry.archivedAt = entry.archivedAt ?? nowIso;
      }
    }

    const saved = await save(next);
    if (!saved) {
      push("Failed to close week.", "error");
      return;
    }
    setReview(closedReview);
    push("Week closed and snapshot stored locally.", "success");
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(activeReview.markdown);
      push("Markdown copied.", "success");
    } catch {
      push("Clipboard write failed.", "error");
    }
  };

  const loadReview = (nextReview: WeeklyReview) => {
    setWeekStart(nextReview.weekStart);
    setReview(nextReview);
  };

  const loadSnapshot = (week: string) => {
    const matchingReview = reviewHistory.items.find((item) => item.weekStart === week);
    if (matchingReview) {
      loadReview(matchingReview);
      return;
    }

    const snapshot = snapshotHistory.items.find((item) => item.weekStart === week);
    const snapshotReview =
      snapshot?.data && typeof snapshot.data.review === "object" && snapshot.data.review
        ? (snapshot.data.review as WeeklyReview)
        : null;

    if (snapshotReview) {
      loadReview(snapshotReview);
      return;
    }

    setWeekStart(week);
    setReview(null);
  };

  return (
    <div className="space-y-6">
      <GlassPanel variant="hero">
        <SectionHeader
          eyebrow="Review"
          title="Weekly Review"
          subtitle={`${weekStart} to ${weekEnd}`}
          rightControls={<Pill tone="accent">{snapshotHistory.items.length} local snapshots</Pill>}
        />
        <div className="mt-4 grid gap-2 md:grid-cols-[auto_auto_180px_auto_auto_auto]">
          <button className="button-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
            Previous Week
          </button>
          <button className="button-secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Current Week
          </button>
          <input
            className="input"
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            aria-label="Select week start"
          />
          <button className="button-primary" onClick={generateReview}>
            Generate Markdown Recap
          </button>
          <button className="button-secondary" onClick={copyMarkdown}>
            Copy
          </button>
          <button className="button-secondary" onClick={closeWeek}>
            {reviewHistory.items.some((item) => item.weekStart === weekStart) ? "Update Snapshot" : "Close Week"}
          </button>
        </div>
        {duplicateWarnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="font-medium">Messy data handled safely</div>
            <div className="mt-2 grid gap-2">
              {duplicateWarnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <GlassPanel key={card.label} variant="standard">
            <div className="text-xs uppercase tracking-[0.24em] text-muted">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
          </GlassPanel>
        ))}
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel variant="standard">
          <SectionHeader
            eyebrow="Breakdown"
            title="Per Project"
            subtitle={`${breakdown.length} projects in this review`}
            rightControls={<Pill>{activeReview.highlights.length} highlights</Pill>}
          />
          <div className="mt-4 grid gap-3">
            {breakdown.length === 0 && <p className="text-sm text-muted">No project activity logged for this week.</p>}

            {/* Shipped / Completed */}
            {breakdown.filter(p => p.project?.progress === 100 && p.activity > 0).length > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-emerald-400 mb-3 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Shipped
                </div>
                <div className="grid gap-3">
                  {breakdown.filter(p => p.project?.progress === 100 && p.activity > 0).map(renderProjectCard)}
                </div>
              </div>
            )}

            {/* Moved / Active */}
            {breakdown.filter(p => p.activity > 0 && p.project?.progress !== 100).length > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-accent mb-3 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent"></span> Moved Forward
                </div>
                <div className="grid gap-3">
                  {breakdown.filter(p => p.activity > 0 && p.project?.progress !== 100).map(renderProjectCard)}
                </div>
              </div>
            )}

            {/* Stuck / No Activity */}
            {breakdown.filter(p => p.activity === 0).length > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-red-400/80 mb-3 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400/50"></span> Stuck / Idle
                </div>
                <div className="grid gap-3">
                  {breakdown.filter(p => p.activity === 0).map(renderProjectCard)}
                </div>
              </div>
            )}
          </div>
        </GlassPanel>

        <div className="grid gap-6">
          <GlassPanel variant="standard">
            <SectionHeader
              eyebrow="Highlights"
              title="This Week"
              subtitle="Markdown recap summary"
            />
            <div className="mt-4 grid gap-2">
              {activeReview.highlights.map((highlight) => (
                <div key={highlight} className="rounded-lg border border-muted bg-subtle px-3 py-2 text-sm text-muted">
                  {highlight}
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel variant="standard">
            <SectionHeader
              eyebrow="History"
              title="Closed Weeks"
              subtitle={`${reviewHistory.items.length} review snapshots`}
            />
            <div className="mt-4 grid gap-2">
              {reviewHistory.items.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  className="table-row text-left"
                  onClick={() => loadReview(item)}
                  aria-label={`Load weekly review for ${item.weekStart}`}
                >
                  <span>
                    {item.weekStart} to {item.weekEnd}
                  </span>
                  <span className="text-xs text-muted">
                    {item.closedAt ? formatDate(item.closedAt) : "Open"}
                  </span>
                </button>
              ))}
              {reviewHistory.items.length === 0 && (
                <p className="text-sm text-muted">No weeks closed yet.</p>
              )}
            </div>
          </GlassPanel>

          <GlassPanel variant="standard">
            <SectionHeader
              eyebrow="Snapshots"
              title="Local Store"
              subtitle={`${snapshotHistory.items.length} stored weeks`}
            />
            <div className="mt-4 grid gap-2">
              {snapshotHistory.items.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  className="table-row text-left"
                  onClick={() => loadSnapshot(item.weekStart)}
                  aria-label={`Load snapshot for ${item.weekStart}`}
                >
                  <span>
                    {item.weekStart} to {item.weekEnd}
                  </span>
                  <span className="text-xs text-muted">
                    {reviewHistory.items.some((reviewItem) => reviewItem.weekStart === item.weekStart) ? "Review attached" : "Snapshot only"}
                  </span>
                </button>
              ))}
              {snapshotHistory.items.length === 0 && (
                <p className="text-sm text-muted">Close a week to store a snapshot locally.</p>
              )}
            </div>
          </GlassPanel>
        </div>
      </section>

      <GlassPanel variant="standard">
        <SectionHeader
          eyebrow="Markdown"
          title="Recap"
          subtitle="Copy or reuse directly"
          rightControls={<Pill tone="accent">{activeReview.closedAt ? "Closed week" : "Draft review"}</Pill>}
        />
        <textarea
          className="input mt-4 min-h-[320px] font-mono text-sm"
          value={activeReview.markdown}
          readOnly
          aria-label="Weekly review markdown"
        />
      </GlassPanel>
    </div >
  );
}
