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
import AccountSettingsPage from "./pages/AccountSettingsPage";
import WeeklyReviewPage from "./pages/WeeklyReviewPage";
import { computeStreak, todayKey } from "@linkra/shared";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthPage from "./pages/AuthPage";

function Shell() {
  const { state, loading, error, refresh } = useAppState();
  const [active, setActive] = useState<NavItem>("Dashboard");
  const [commandOpen, setCommandOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash.startsWith("project/")) {
        setProjectId(hash.split("/")[1]);
        setActive("Dashboard");
      } else if (hash) {
        const match = ["Dashboard", "Daily Goals", "Roadmap", "Weekly Review", "Commits", "Tools", "Settings", "Account"].find(
          (item) => item.toLowerCase().replace(" ", "-") === hash
        ) as NavItem | undefined;
        if (match) {
          setActive(match);
          setProjectId(null);
        }
      } else {
        setProjectId(null);
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
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
    const newHash = projectId && active === "Dashboard" ? `project/${projectId}` : hash;
    window.history.replaceState(null, "", `#${newHash}`);
  }, [active, projectId]);

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

  const score = Object.values(state?.dailyGoalsByDate || {}).reduce((acc, entry) => acc + entry.score, 0);
  const streak = state ? computeStreak(Object.values(state.dailyGoalsByDate)) : 0;

  if (!session) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <Sidebar active={active} onChange={(item) => setActive(item)} />
      <main className="flex-1 px-4 lg:px-6 py-6 pb-28 lg:pb-6 flex flex-col gap-6 overflow-x-hidden">
        <div className="sticky-header">
          <Header score={score} onOpenCommand={() => setCommandOpen(true)} />
        </div>
        {loading && <div className="panel">Loading Linkra data...</div>}
        {error && <div className="panel">Error: {error}</div>}
        {state && !loading && (
          <div className="grid gap-6">
            {active === "Dashboard" && <DashboardPage projectId={projectId} />}
            {active === "Daily Goals" && <DailyGoalsPage />}
            {active === "Roadmap" && <RoadmapPage />}
            {active === "Weekly Review" && <WeeklyReviewPage />}
            {active === "Commits" && <CommitsPage />}
            {active === "Tools" && <ToolsPage />}
            {active === "Settings" && <SettingsPage />}
            {active === "Account" && <AccountSettingsPage />}
          </div>
        )}
        <div className="text-xs text-muted">Streak: {streak} days · Local-first mode active</div>
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
