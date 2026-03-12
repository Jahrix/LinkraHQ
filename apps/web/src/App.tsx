import React, { useEffect, useMemo, useState } from "react";
import { AppStateProvider, useAppState } from "./lib/state";
import Sidebar, { type NavItem } from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
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
import { PomodoroProvider } from "./lib/pomodoroContext";
import { AiQuotaProvider } from "./lib/aiQuotaContext";
import { finalizeAuthRedirectUrl } from "./lib/githubAuth";
import { playStartupSoundOnce } from "./lib/sounds";

function Shell() {
  const { state, loading, error, refresh } = useAppState();
  const [active, setActive] = useState<NavItem>("Dashboard");
  const [commandOpen, setCommandOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthResolved(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthResolved(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }
    playStartupSoundOnce(userId);
  }, [session?.user?.id]);

  useEffect(() => {
    const cleanedUrl = finalizeAuthRedirectUrl(window.location);
    if (cleanedUrl) {
      window.history.replaceState(null, "", cleanedUrl);
    }

    const handleHashChange = () => {
      const raw = window.location.hash.replace("#", "");
      const hash = raw.split("?")[0]; // strip hash query params before route matching
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
    const activityHue = 200 - Math.min(state.dailyGoalsByDate[todayKey()]?.score ?? 0, 100) * 0.9;
    document.documentElement.style.setProperty("--accent-2", `hsl(${activityHue} 80% 60%)`);
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
  const completedTaskCount = (state?.projects || []).reduce(
    (acc, project) => acc + project.tasks.filter((task) => task.done).length,
    0
  );
  const momentumSignal = score + completedTaskCount;
  const streak = state ? computeStreak(Object.values(state.dailyGoalsByDate)) : 0;

  const displayName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.user_metadata?.user_name ||
    session?.user?.user_metadata?.preferred_username ||
    session?.user?.email?.split("@")[0] ||
    "there";

  if (!authResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="panel flex items-center gap-3 text-sm text-muted">
          <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Restoring your workspace…
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <Sidebar active={active} onChange={(item) => setActive(item)} />
      <div className="lg:hidden"><MobileNav active={active} onChange={(item) => setActive(item)} /></div>
      <main className="flex-1 px-3 lg:px-6 py-3 lg:py-6 pb-24 lg:pb-6 flex flex-col gap-4 lg:gap-6 overflow-x-hidden min-w-0">
        <div className="sticky-header">
          <Header
            score={score}
            momentumSignal={momentumSignal}
            userName={displayName}
            onOpenCommand={() => setCommandOpen(true)}
            hideGreeting={active === "Dashboard"}
          />
        </div>
        {loading && (
          <div className="panel flex items-center gap-3 text-sm text-muted">
            <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading Linkra data…
          </div>
        )}
        {error && (
          <div className="panel flex items-start gap-3 border-red-500/30 bg-red-900/20 text-sm text-red-200">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {state && !loading && (
          <div className="grid gap-4 lg:gap-6">
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
        <AiQuotaProvider>
          <PomodoroProvider>
            <ErrorBoundary>
              <Shell />
            </ErrorBoundary>
          </PomodoroProvider>
        </AiQuotaProvider>
      </AppStateProvider>
    </ToastProvider>
  );
}
