import React, { useEffect, useMemo, useState, useRef } from "react";
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
import BuildPage from "./pages/BuildPage";
import HabitsPage from "./pages/HabitsPage";
import { computeStreak, todayKey, isHabitDueToday, computeDecay } from "@linkra/shared";
import { calculateMomentum } from "./lib/momentum";
import MomentumBreakdownSheet from "./components/MomentumBreakdownSheet";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthPage from "./pages/AuthPage";
import { PomodoroProvider } from "./lib/pomodoroContext";
import { AiQuotaProvider } from "./lib/aiQuotaContext";
import { finalizeAuthRedirectUrl } from "./lib/githubAuth";
import { playStartupSoundOnce } from "./lib/sounds";
import { api } from "./lib/api";
import { HabitContextProvider, useHabitContext } from "./lib/habitContext";

function Shell() {
  const { state, loading, error, refresh } = useAppState();
  const [active, setActive] = useState<NavItem>("Dashboard");
  const [commandOpen, setCommandOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const { habits, completedTodayIds } = useHabitContext();
  const [isMomentumSheetOpen, setIsMomentumSheetOpen] = useState(false);
  const [lastGPress, setLastGPress] = useState(0);

  const totalActiveHabitsToday = useMemo(() => {
    return habits.filter((h) => !h.archivedAt && isHabitDueToday(h)).length;
  }, [habits]);
  const todayHabitCompletedCount = completedTodayIds.size;
  const prevMomentumRef = useRef(0);

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
        const match = ["Dashboard", "Daily Goals", "Habits", "Roadmap", "Weekly Review", "Build", "Commits", "Tools", "Settings", "Account"].find(
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
    const handleSequence = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const now = Date.now();

      if (key === "g") {
        setLastGPress(now);
        return;
      }

      if (now - lastGPress < 500) {
        if (key === "h") setActive("Habits");
        else if (key === "d") setActive("Dashboard");
        else if (key === "g") setActive("Daily Goals");
        else if (key === "r") setActive("Roadmap");
        else if (key === "c") setActive("Commits");
        else if (key === "b") {
          setActive("Dashboard");
          setTimeout(() => window.dispatchEvent(new CustomEvent("open-fill-day-sheet")), 50);
        }
        else if (key === "w") setActive("Weekly Review");
        
        setLastGPress(0);
      }
    };
    window.addEventListener("keydown", handleSequence);
    return () => window.removeEventListener("keydown", handleSequence);
  }, [lastGPress, setActive]);


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
      { label: "Go to Habits", action: () => setActive("Habits") },
      { label: "Go to Roadmap", action: () => setActive("Roadmap") },
      { label: "Go to Weekly Review", action: () => setActive("Weekly Review") },
      { label: "Go to Build", action: () => setActive("Build") },
      { label: "Go to Commits", action: () => setActive("Commits") },
      { label: "Go to Tools", action: () => setActive("Tools") },
      { label: "Go to Settings", action: () => setActive("Settings") },
      { label: "Refresh Data", action: () => refresh() },
      { label: "Plan Day (Fill My Day)", action: () => {
          setActive("Dashboard");
          setTimeout(() => window.dispatchEvent(new CustomEvent("open-fill-day-sheet")), 50);
        }
      }
    ];
  }, [refresh, setActive]);

  const score = Object.values(state?.dailyGoalsByDate || {}).reduce((acc, entry) => acc + entry.score, 0);
  const completedTaskCount = (state?.projects || []).reduce(
    (acc, project) => acc + project.tasks.filter((task) => task.done).length,
    0
  );
  const decay = state ? computeDecay(state.dailyGoalsByDate) : 0;
  const finalMomentum = score + completedTaskCount + (todayHabitCompletedCount * 3) + decay;

  const momentumData = useMemo(() => {
    if (!state) return { score: 0, streak: 0, dailyGoalProgress: 0, roadmapProgress: 0, habitsProgress: 0, history: [] };
    return calculateMomentum(state, todayHabitCompletedCount, totalActiveHabitsToday);
  }, [state, todayHabitCompletedCount, totalActiveHabitsToday]);

  const streak = momentumData.streak;

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
            score={finalMomentum}
            momentumSignal={finalMomentum}
            userName={displayName}
            onOpenCommand={() => setCommandOpen(true)}
            onMomentumClick={() => setIsMomentumSheetOpen(true)}
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
            {active === "Habits" && <HabitsPage />}
            {active === "Build" && <BuildPage />}
            {active === "Commits" && <CommitsPage />}
            {active === "Tools" && <ToolsPage />}
            {active === "Settings" && <SettingsPage />}
            {active === "Account" && <AccountSettingsPage />}
          </div>
        )}

      </main>
      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <ToastHost />
      <MomentumBreakdownSheet
        open={isMomentumSheetOpen}
        onClose={() => setIsMomentumSheetOpen(false)}
        currentMomentum={finalMomentum}
        streak={momentumData.streak}
        dailyGoalProgress={momentumData.dailyGoalProgress}
        roadmapProgress={momentumData.roadmapProgress}
        habitsProgress={momentumData.habitsProgress}
        history={momentumData.history}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppStateProvider>
        <AiQuotaProvider>
          <PomodoroProvider>
            <HabitContextProvider>
              <ErrorBoundary>
                <Shell />
              </ErrorBoundary>
            </HabitContextProvider>
          </PomodoroProvider>
        </AiQuotaProvider>
      </AppStateProvider>
    </ToastProvider>
  );
}
