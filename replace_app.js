const fs = require('fs');

const path = 'apps/web/src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

const importInjection = `import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthPage from "./pages/AuthPage";
`;

content = content.replace('import { computeStreak, todayKey } from "@linkra/shared";', 'import { computeStreak, todayKey } from "@linkra/shared";\n' + importInjection);

const stateInjection = `  const [session, setSession] = useState<Session | null>(null);
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
  }, []);`;

content = content.replace('  const [commandOpen, setCommandOpen] = useState(false);', '  const [commandOpen, setCommandOpen] = useState(false);\n' + stateInjection);

const hashEffectRegex = /useEffect\(\(\) => \{\n\s*const hash = window\.location\.hash\.replace\("#", ""\);\n\s*if \(hash\) \{\n[\s\S]*?\}\n  \}, \[\]\);/;

const newHashEffect = `useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash.startsWith("project/")) {
        setProjectId(hash.split("/")[1]);
        setActive("Dashboard");
      } else if (hash) {
        const match = ["Dashboard", "Daily Goals", "Roadmap", "Weekly Review", "Commits", "Tools", "Settings"].find(
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
  }, []);`;

content = content.replace(hashEffectRegex, newHashEffect);

const dashboardRegex = /\{active === "Dashboard" && <DashboardPage \/>\}/;
const newDashboard = `{active === "Dashboard" && <DashboardPage projectId={projectId} />}`;

content = content.replace(dashboardRegex, newDashboard);

const shellReturnRegex = /return \([\s\S]*?(?=\n\}\n\nexport default function App)/;
const newShellReturn = `  if (!session) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[80px_1fr]">
      <Sidebar active={active} onChange={(item) => setActive(item)} />
      <main className="px-6 py-6 flex flex-col gap-6">
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
          </div>
        )}
        <div className="text-xs text-muted">Streak: {streak} days · Local-first mode active</div>
      </main>
      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <ToastHost />
    </div>
  );`;

content = content.replace(shellReturnRegex, newShellReturn);

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx updated for Auth and Routing');
