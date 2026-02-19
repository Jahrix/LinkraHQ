import React, { useEffect, useMemo, useState } from "react";
import { AppStateProvider, useAppState } from "./lib/state";
import Sidebar, { type NavItem } from "./components/Sidebar";
import Header from "./components/Header";
import CommandPalette, { type Command } from "./components/CommandPalette";
import { ToastProvider } from "./lib/toast";
import ToastHost from "./components/ToastHost";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardPage from "./pages/DashboardPage";
import DailyGoalsPage from "./pages/DailyGoalsPage";
import RoadmapPage from "./pages/RoadmapPage";
import CommitsPage from "./pages/CommitsPage";
import ToolsPage from "./pages/ToolsPage";
import SettingsPage from "./pages/SettingsPage";
import WeeklyReviewPage from "./pages/WeeklyReviewPage";
import { computeStreak, todayKey } from "@linkra/shared";

function Shell() {
  const { state, loading, error, refresh } = useAppState();
  const [active, setActive] = useState<NavItem>("Dashboard");
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash) {
      const match = ["Dashboard", "Daily Goals", "Roadmap", "Weekly Review", "Commits", "Tools", "Settings"].find(
        (item) => item.toLowerCase().replace(" ", "-") === hash
      ) as NavItem | undefined;
      if (match) setActive(match);
    }
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const hash = active.toLowerCase().replace(" ", "-");
    window.history.replaceState(null, "", `#${hash}`);
  }, [active]);

  useEffect(() => {
    if (!state) return;
    document.documentElement.style.setProperty("--accent", state.userSettings.accent);
    const activityHue = 200 - Math.min(state.dailyGoalsByDate[todayKey()]?.score ?? 0, 100) * 0.9;
    document.documentElement.style.setProperty("--accent-2", `hsl(${activityHue} 80% 60%)`);
    document.body.classList.toggle("reduce-motion", state.userSettings.reduceMotion);
  }, [state]);

  const commands = useMemo<Command[]>(() => {
    return [
      { label: "Go to Dashboard", action: () => setActive("Dashboard") },
      { label: "Go to Daily Goals", action: () => setActive("Daily Goals") },
      { label: "Go to Roadmap", action: () => setActive("Roadmap") },
      { label: "Go to Weekly Review", action: () => setActive("Weekly Review") },
      { label: "Go to Commits", action: () => setActive("Commits") },
      { label: "Go to Tools", action: () => setActive("Tools") },
      { label: "Go to Settings", action: () => setActive("Settings") },
      { label: "Refresh Data", action: () => refresh() }
    ];
  }, [refresh]);

  const score = state?.dailyGoalsByDate[todayKey()]?.score ?? 0;
  const streak = state ? computeStreak(Object.values(state.dailyGoalsByDate)) : 0;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[240px_1fr]">
      <Sidebar active={active} onChange={(item) => setActive(item)} />
      <main className="px-8 py-6 flex flex-col gap-6">
        <Header score={score} onOpenCommand={() => setCommandOpen(true)} />
        {loading && <div className="panel">Loading Linkra data...</div>}
        {error && <div className="panel">Error: {error}</div>}
        {state && !loading && (
          <div className="grid gap-6">
            {active === "Dashboard" && <DashboardPage />}
            {active === "Daily Goals" && <DailyGoalsPage />}
            {active === "Roadmap" && <RoadmapPage />}
            {active === "Weekly Review" && <WeeklyReviewPage />}
            {active === "Commits" && <CommitsPage />}
            {active === "Tools" && <ToolsPage />}
            {active === "Settings" && <SettingsPage />}
          </div>
        )}
        <div className="text-xs text-white/50">Streak: {streak} days · Local-first mode active</div>
      </main>
      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppStateProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </AppStateProvider>
    </ToastProvider>
  );
}
