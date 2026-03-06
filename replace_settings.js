const fs = require('fs');

const path = 'apps/web/src/pages/SettingsPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject Supabase imports and state
const importInjection = `import { supabase } from "../lib/supabase";\\n`;
content = content.replace('import { formatDate } from "../lib/date";', 'import { formatDate } from "../lib/date";\\n' + importInjection);

const stateInjection = `  const [activeTab, setActiveTab] = useState<"Profile" | "Integrations" | "LockIn" | "Appearance" | "Data">("Profile");
  const [user, setUser] = useState<any>(null);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const linkGithub = async () => {
    setIsLinking(true);
    const { error } = await supabase.auth.linkIdentity({ provider: 'github' });
    if (error) push("Failed to link Github: " + error.message);
    else push("Redirecting to GitHub...");
    setIsLinking(false);
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (error) push("Failed to update profile.");
    else push("Profile updated successfully!");
  };`;

content = content.replace('  const [scanStatus, setScanStatus] = useState<{ lastScanAt: string | null; errors: string[] } | null>(null);', '  const [scanStatus, setScanStatus] = useState<{ lastScanAt: string | null; errors: string[] } | null>(null);\\n' + stateInjection);

// 2. Rewrite the return layout
const returnRegex = /  return \([\\s\\S]*?\n  \);\n\}/;

const newReturn = `  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 h-full">
      {/* Settings Navigation Sidebar */}
      <div className="flex flex-col gap-2 border-r border-stroke pr-6 min-h-[60vh]">
        {[
          { id: "Profile", label: "My Profile" },
          { id: "Integrations", label: "Integrations" },
          { id: "LockIn", label: "Lock-in Dashboard" },
          { id: "Appearance", label: "Appearance" },
          { id: "Data", label: "Data Export" },
        ].map(tab => (
          <button
             key={tab.id}
             onClick={() => setActiveTab(tab.id as any)}
             className={\`text-left px-4 py-2 rounded-lg text-sm transition \${activeTab === tab.id ? "bg-muted text-strong font-medium" : "text-muted hover:bg-subtle hover:text-strong"}\`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Settings Content */}
      <div className="space-y-6 pb-24">
        {activeTab === "Profile" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold mb-6">My Profile</h2>
            
            <div className="panel space-y-4">
              <h3 className="font-medium border-b border-stroke pb-3 mb-4">Personal Information</h3>
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Full Name</label>
                  <input name="name" className="input" defaultValue={user?.user_metadata?.full_name || ""} placeholder="John Doe" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted">Email Address</label>
                  <input disabled className="input opacity-50" value={user?.email || ""} />
                </div>
                <button type="submit" className="button-primary mt-2">Save Changes</button>
              </form>
            </div>

            <div className="panel space-y-4">
              <h3 className="font-medium border-b border-stroke pb-3 mb-4">Connected Accounts</h3>
              <p className="text-sm text-muted">Connect third-party accounts to sync data seamlessly.</p>
              
              <div className="flex items-center justify-between p-4 bg-bg-2 border border-stroke rounded-xl">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center text-xl">GH</div>
                   <div>
                     <p className="font-medium">GitHub</p>
                     <p className="text-xs text-muted">Sign in and sync repos</p>
                   </div>
                 </div>
                 {user?.app_metadata?.providers?.includes('github') ? (
                    <span className="text-sm text-green-400 border border-green-400/20 bg-green-400/10 px-3 py-1 rounded-full">Connected</span>
                 ) : (
                    <button onClick={linkGithub} disabled={isLinking} className="button-secondary">
                      {isLinking ? "Redirecting..." : "Connect"}
                    </button>
                 )}
              </div>
            </div>
            
            <button onClick={logout} className="button-secondary mt-8 text-red-400 border-red-400/20 hover:bg-red-400/10">Log Out</button>
          </div>
        )}

        {activeTab === "Integrations" && (
           <div className="space-y-6">
              <h2 className="text-2xl font-semibold mb-6">Integrations & Workflows</h2>
              <div className="panel space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">GitHub Scraper</p>
                  <p className="text-sm text-muted">
                    {state.github.loggedIn
                      ? \`Connected as \${state.github.user?.login ?? "GitHub user"}.\`
                      : "Not connected. Login to enable global API-based commits."}
                  </p>
                  <div className="filter-row mt-4">
                    {!state.github.loggedIn && (
                      <a className="button-primary" href="/auth/github/start">
                        Login with GitHub API
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="panel space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Local Git</p>
                  <h2 className="text-lg font-semibold">Repo Scanning</h2>
                </div>
                <div className="text-sm text-muted">
                  <span className="mr-2">Repos found: {localRepos.length}</span>
                  <span className="mr-2">
                    Last scan: {lastScanAt ? formatDate(lastScanAt) : "Never"}
                  </span>
                  {scanErrors.length > 0 && <span className="text-amber-200">Errors: {scanErrors.length}</span>}
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className="input"
                    placeholder="Add watch directory (e.g. /Users/you/Developer)"
                    value={watchDir}
                    onChange={(e) => setWatchDir(e.target.value)}
                  />
                  <button className="button-primary" onClick={addWatchDir}>
                    Add Watch Dir
                  </button>
                </div>
                <div className="table">
                  {state.userSettings.repoWatchDirs.length === 0 && (
                    <p className="text-sm text-muted">No watch directories yet.</p>
                  )}
                  {state.userSettings.repoWatchDirs.map((dir) => (
                    <div key={dir} className="table-row">
                      <span className="text-sm text-muted">{dir}</span>
                      <button className="button-secondary" onClick={() => removeWatchDir(dir)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="toggle">
                    Scan interval
                    <select
                      className="input"
                      value={state.userSettings.repoScanIntervalMinutes}
                      onChange={(e) => updateScanInterval(Number(e.target.value))}
                    >
                      <option value={5}>Every 5 min</option>
                      <option value={15}>Every 15 min</option>
                      <option value={30}>Every 30 min</option>
                      <option value={60}>Every 60 min</option>
                    </select>
                  </label>
                  <label className="toggle">
                    Watcher enabled
                    <input
                      type="checkbox"
                      checked={state.userSettings.gitWatcherEnabled}
                      onChange={(e) => toggleWatcher(e.target.checked)}
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button className="button-secondary" onClick={runScan}>
                      Rescan Now
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className="input"
                    placeholder="Exclude pattern (e.g. **/node_modules/**)"
                    value={excludePattern}
                    onChange={(e) => setExcludePattern(e.target.value)}
                  />
                  <button className="button-secondary" onClick={addExcludePattern}>
                    Add Exclude
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.userSettings.repoExcludePatterns.map((pattern) => (
                    <button
                      key={pattern}
                      className="chip hover:bg-strong"
                      onClick={() => removeExcludePattern(pattern)}
                    >
                      {pattern}
                    </button>
                  ))}
                </div>
                {scanErrors.length > 0 && (
                  <div className="text-sm text-amber-200">
                    {scanErrors.slice(0, 3).map((err) => (
                      <div key={err}>{err}</div>
                    ))}
                  </div>
                )}
              </div>
           </div>
        )}

        {activeTab === "LockIn" && (
           <div className="space-y-6">
              <h2 className="text-2xl font-semibold mb-6">Lock-in Dashboard Engine</h2>
              
              <div className="panel space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Insights</p>
                  <h2 className="text-lg font-semibold">Signals → Actions</h2>
                  <p className="text-sm text-muted mt-1">Configure which automated anomaly/insights rules run against your state.</p>
                </div>
                <div className="grid gap-2 mt-4">
                  {insightRules.map((rule) => {
                    const disabled = state.userSettings.disabledInsightRules?.includes(rule.id);
                    return (
                      <label key={rule.id} className="flex items-center justify-between rounded-lg border border-stroke bg-subtle px-4 py-3 text-sm">
                        <div>
                          <div className="font-medium text-strong">{rule.title}</div>
                          <div className="text-xs text-muted mt-1">{rule.description}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={!disabled}
                          onChange={() => toggleInsightRule(rule.id)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="panel space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Backups</p>
                  <h2 className="text-lg font-semibold">Auto-backup</h2>
                </div>
                <div className="filter-row flex-wrap">
                  <label className="toggle">
                    Enable daily backups
                    <input
                      type="checkbox"
                      checked={state.userSettings.enableDailyBackup}
                      onChange={(e) => updateBackupSettings("enableDailyBackup", e.target.checked)}
                    />
                  </label>
                  <label className="toggle">
                    Retention (days)
                    <input
                      type="number"
                      min={1}
                      className="input w-24"
                      value={state.userSettings.backupRetentionDays}
                      onChange={(e) => updateBackupSettings("backupRetentionDays", Number(e.target.value))}
                    />
                  </label>
                  <button className="button-secondary" onClick={runBackup}>
                    Run Backup Now
                  </button>
                </div>
                <p className="text-xs text-muted">Backups stored in ~/.linkra/backups.</p>
              </div>

              <div className="panel space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Startup</p>
                  <h2 className="text-lg font-semibold">Autostart</h2>
                </div>
                <p className="text-sm text-muted">
                  Generate local startup files. No admin rights needed. Copy into the OS startup folder.
                </p>
                <div className="filter-row flex-wrap">
                  <label className="toggle">
                    Start on login
                    <input
                      type="checkbox"
                      checked={state.userSettings.startOnLogin}
                      onChange={(e) => toggleStartup(e.target.checked)}
                    />
                  </label>
                  <button className="button-secondary" onClick={generateStartup}>
                    Regenerate Files
                  </button>
                </div>
                {startupInfo && (
                  <div className="mt-2 space-y-2 text-sm text-muted bg-bg-2 p-3 rounded-lg border border-stroke">
                    <p>Detected OS: {startupInfo.os}</p>
                    <pre className="whitespace-pre-wrap rounded-lg border border-muted bg-subtle p-3 text-xs text-muted">
                      {startupInfo.instructions}
                    </pre>
                    <div>
                      <p className="text-muted">Generated files:</p>
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                        {startupInfo.files.map((file) => (
                          <li key={file}>{file}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
           </div>
        )}

        {activeTab === "Appearance" && (
           <div className="space-y-6">
              <h2 className="text-2xl font-semibold mb-6">Appearance</h2>
              <div className="panel space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Theme</p>
                  <h2 className="text-lg font-semibold">Personalize</h2>
                </div>
                <div className="filter-row flex-wrap">
                  <label className="toggle">
                    Accent Color
                    <input
                      type="color"
                      value={state.userSettings.accent}
                      onChange={(e) => updateAppearance("accent", e.target.value)}
                    />
                  </label>
                  <label className="toggle">
                    Reduce Motion
                    <input
                      type="checkbox"
                      checked={state.userSettings.reduceMotion}
                      onChange={(e) => updateAppearance("reduceMotion", e.target.checked)}
                    />
                  </label>
                </div>
              </div>
           </div>
        )}

        {activeTab === "Data" && (
           <div className="space-y-6">
              <h2 className="text-2xl font-semibold mb-6">Data Management & Export</h2>
              <div className="panel space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Local Data</p>
                  <h2 className="text-lg font-semibold">Export & Import</h2>
                  <p className="text-sm text-muted mt-1">Safely export your entire lock-in dataset as JSON or import an existing snapshot.</p>
                </div>
                <div className="filter-row flex-wrap">
                  <button className="button-primary" onClick={handleExport}>
                    Export JSON
                  </button>
                  <label className="button-secondary inline-flex items-center gap-2">
                    Import JSON
                    <input
                      type="file"
                      accept="application/json"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleImportFile(file);
                      }}
                    />
                  </label>
                </div>
                {importError && <p className="text-sm text-red-400">{importError}</p>}
                
                {preview && (
                  <div className="panel space-y-3 bg-bg-2">
                    <div>
                      <h4 className="text-base font-semibold">Import Preview</h4>
                      <p className="text-sm text-muted">
                        Schema {preview.sourceSchemaVersion} → {SCHEMA_VERSION}
                      </p>
                    </div>
                    {preview.sourceSchemaVersion !== SCHEMA_VERSION && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                        Older export detected. Linkra will import the migrated v{SCHEMA_VERSION} shape shown below.
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                      <div><p className="text-xl font-bold">{preview.counts.projects}</p><p className="text-xs text-muted">Projects</p></div>
                      <div><p className="text-xl font-bold">{preview.counts.tasks}</p><p className="text-xs text-muted">Tasks</p></div>
                      <div><p className="text-xl font-bold">{preview.counts.goals}</p><p className="text-xs text-muted">Goals</p></div>
                      <div><p className="text-xl font-bold">{preview.counts.localRepos}</p><p className="text-xs text-muted">Local Repos</p></div>
                    </div>
                    <div className="rounded-lg bg-black/20 p-4 font-mono text-xs">
                      <div>Summary Δ: +{preview.diff.summary.additions} / ~{preview.diff.summary.changes} / -{preview.diff.summary.removals}</div>
                      <div className="text-amber-300">Conflicts on merge: {preview.diff.summary.conflicts}</div>
                    </div>
                    <div className="filter-row mt-4">
                      <button className="button-primary" onClick={() => applyImport("replace")}>
                        Replace All
                      </button>
                      <button className="button-secondary" onClick={() => applyImport("merge_keep")}>
                        Merge (Keep Local)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel space-y-4 border border-red-500/20 bg-red-500/5">
                 <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
                 <p className="text-sm text-muted">Irreversibly delete all data tracked in the current Linkra instance. Make sure you export first.</p>
                 <button className="button-secondary text-red-400 border-red-400/30 hover:bg-red-400/20" onClick={handleWipe}>
                    Wipe Local Data
                 </button>
              </div>
           </div>
        )}
      </div>
    </div>
  );
}`;

content = content.replace(returnRegex, newReturn);
fs.writeFileSync(path, content, 'utf8');
console.log('Settings page layout update complete.');
