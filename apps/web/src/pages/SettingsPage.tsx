import React, { useEffect, useState } from "react";
import { SCHEMA_VERSION, applyMigrations, type ExportBundle, insightRules } from "@linkra/shared";
import { api } from "../lib/api";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { computeImportDiff, type ImportDiffResult } from "../lib/importDiff";
import { formatDate } from "../lib/date";

interface ImportPreview {
  bundle: ExportBundle;
  sourceSchemaVersion: number;
  counts: {
    projects: number;
    tasks: number;
    goals: number;
    roadmap: number;
    logs: number;
    focus: number;
    journal: number;
    weeklyReviews: number;
    weeklySnapshots: number;
    localRepos: number;
    dateRange: string;
  };
  diff: ImportDiffResult;
}

export default function SettingsPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [startupInfo, setStartupInfo] = useState<{ os: string; instructions: string; files: string[] } | null>(null);
  const [startupHealth, setStartupHealth] = useState<{
    apiReachable: boolean;
    lastScanAt: string | null;
    scanStatus: any;
    gitAvailable: boolean;
    watchDirs: { dir: string; exists: boolean }[];
  } | null>(null);
  const [watchDir, setWatchDir] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [scanStatus, setScanStatus] = useState<{ lastScanAt: string | null; errors: string[] } | null>(null);

  useEffect(() => {
    api.startupStatus().then(setStartupInfo).catch(() => null);
    api.gitRepos().then((result) => setScanStatus({ lastScanAt: result.lastScanAt, errors: result.errors })).catch(() => null);
    api.startupHealth().then(setStartupHealth).catch(() => null);
  }, []);

  if (!state) return null;

  const handleExport = async () => {
    const bundle = await api.exportState();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkra-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sourceSchemaVersion = typeof data?.schema_version === "number" ? data.schema_version : 1;
      const parsed = applyMigrations(data);
      const tasks = parsed.data.projects.reduce((sum, project) => sum + project.tasks.length, 0);
      const dates = Object.keys(parsed.data.dailyGoalsByDate).sort();
      const dateRange = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "No dates";
      const counts = {
        projects: parsed.data.projects.length,
        tasks,
        goals: Object.values(parsed.data.dailyGoalsByDate).reduce((sum, entry) => sum + entry.goals.length, 0),
        roadmap: parsed.data.roadmapCards.length,
        logs: parsed.data.sessionLogs.length,
        focus: parsed.data.focusSessions.length,
        journal: parsed.data.journalEntries.length,
        weeklyReviews: parsed.data.weeklyReviews.length,
        weeklySnapshots: parsed.data.weeklySnapshots.length,
        localRepos: parsed.data.localRepos.length,
        dateRange
      };
      const diff = computeImportDiff(state, parsed.data);
      setPreview({ bundle: parsed, counts, diff, sourceSchemaVersion });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid JSON schema");
      setPreview(null);
    }
  };

  const applyImport = async (mode: "replace" | "merge_keep" | "merge_overwrite") => {
    if (!preview) return;
    const result = await api.importState(mode, preview.bundle);
    await save(result.state);
    setPreview(null);
    push(`Import ${mode} complete.`);
  };

  const handleWipe = async () => {
    const confirm = window.confirm("This will wipe all local data. Continue?");
    if (!confirm) return;
    const result = await api.wipeState();
    await save(result.state);
    push("Local data wiped.");
  };

  const generateStartup = async () => {
    const result = await api.createStartup();
    setStartupInfo(result);
    push("Startup files generated.");
  };

  const toggleStartup = async (enabled: boolean) => {
    const next = { ...state };
    next.userSettings.startOnLogin = enabled;
    await save(next);
    if (enabled) {
      await generateStartup();
    }
  };

  const updateAppearance = async (key: "accent" | "reduceMotion", value: string | boolean) => {
    const next = { ...state };
    if (key === "accent" && typeof value === "string") {
      next.userSettings.accent = value;
    }
    if (key === "reduceMotion" && typeof value === "boolean") {
      next.userSettings.reduceMotion = value;
    }
    await save(next);
  };

  const logout = async () => {
    await api.logout();
    await refresh();
  };

  const toggleInsightRule = async (ruleId: string) => {
    const next = { ...state };
    const disabled = new Set(next.userSettings.disabledInsightRules ?? []);
    if (disabled.has(ruleId)) {
      disabled.delete(ruleId);
    } else {
      disabled.add(ruleId);
    }
    next.userSettings.disabledInsightRules = Array.from(disabled);
    await save(next);
    await api.runInsights();
  };

  const toggleWatcher = async (enabled: boolean) => {
    const next = { ...state };
    next.userSettings.gitWatcherEnabled = enabled;
    await save(next);
  };

  const updateBackupSettings = async (key: "enableDailyBackup" | "backupRetentionDays", value: boolean | number) => {
    const next = { ...state };
    if (key === "enableDailyBackup" && typeof value === "boolean") {
      next.userSettings.enableDailyBackup = value;
    }
    if (key === "backupRetentionDays" && typeof value === "number") {
      next.userSettings.backupRetentionDays = value;
    }
    await save(next);
  };

  const runBackup = async () => {
    const result = await api.backupRun();
    push(`Backup saved to ${result.filepath}`);
  };

  const runScan = async () => {
    await api.gitScan();
    await refresh();
    const status = await api.gitRepos();
    setScanStatus({ lastScanAt: status.lastScanAt, errors: status.errors });
    push("Local Git scan complete.");
  };

  const addWatchDir = async () => {
    if (!watchDir.trim()) return;
    const next = { ...state };
    const nextDirs = Array.from(
      new Set([...next.userSettings.repoWatchDirs, watchDir.trim()])
    );
    next.userSettings.repoWatchDirs = nextDirs;
    setWatchDir("");
    await save(next);
    await runScan();
  };

  const removeWatchDir = async (dir: string) => {
    const next = { ...state };
    next.userSettings.repoWatchDirs = next.userSettings.repoWatchDirs.filter((item) => item !== dir);
    await save(next);
  };

  const updateScanInterval = async (minutes: number) => {
    const next = { ...state };
    next.userSettings.repoScanIntervalMinutes = minutes;
    await save(next);
  };

  const addExcludePattern = async () => {
    if (!excludePattern.trim()) return;
    const next = { ...state };
    const nextPatterns = Array.from(
      new Set([...next.userSettings.repoExcludePatterns, excludePattern.trim()])
    );
    next.userSettings.repoExcludePatterns = nextPatterns;
    setExcludePattern("");
    await save(next);
  };

  const removeExcludePattern = async (pattern: string) => {
    const next = { ...state };
    next.userSettings.repoExcludePatterns = next.userSettings.repoExcludePatterns.filter(
      (item) => item !== pattern
    );
    await save(next);
  };

  const localRepos = state.localRepos ?? [];
  const lastScanAt =
    scanStatus?.lastScanAt ??
    localRepos
      .map((repo) => repo.scannedAt)
      .filter(Boolean)
      .sort()
      .pop() ??
    null;
  const scanErrors =
    scanStatus?.errors ??
    localRepos
      .map((repo) => repo.scanError)
      .filter((error): error is string => Boolean(error));


  return (
    <div className="space-y-6">
      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">GitHub</p>
          <h2 className="text-lg font-semibold">Connection</h2>
        </div>
        <p className="text-sm text-muted">
          {state.github.loggedIn
            ? `Connected as ${state.github.user?.login ?? "GitHub user"}.`
            : "Not connected. Login to sync commits."}
        </p>
        <div className="filter-row">
          {!state.github.loggedIn && (
            <a className="button-primary" href="/auth/github/start">
              Login with GitHub
            </a>
          )}
          {state.github.loggedIn && (
            <button className="button-secondary" onClick={logout}>
              Logout
            </button>
          )}
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

      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Insights</p>
          <h2 className="text-lg font-semibold">Signals → Actions</h2>
        </div>
        <div className="grid gap-2">
          {insightRules.map((rule) => {
            const disabled = state.userSettings.disabledInsightRules?.includes(rule.id);
            return (
              <label key={rule.id} className="flex items-center justify-between rounded-lg border border-muted bg-subtle px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{rule.title}</div>
                  <div className="text-xs text-muted">{rule.description}</div>
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

      <div className="panel space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Data</p>
          <h2 className="text-lg font-semibold">Export &amp; Import</h2>
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
          <button className="button-secondary" onClick={handleWipe}>
            Wipe Local Data
          </button>
        </div>
        {importError && <p className="text-sm text-red-300">{importError}</p>}
        {preview && (
          <div className="panel space-y-3">
            <div>
              <h4 className="text-base font-semibold">Import Preview</h4>
              <p className="text-sm text-muted">
                Schema {preview.sourceSchemaVersion} → {SCHEMA_VERSION}
              </p>
            </div>
            {preview.sourceSchemaVersion !== SCHEMA_VERSION && (
              <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                Older export detected. Linkra will import the migrated v{SCHEMA_VERSION} shape shown below.
              </div>
            )}
            <div className="table">
              <div className="table-row">Projects: {preview.counts.projects}</div>
              <div className="table-row">Tasks: {preview.counts.tasks}</div>
              <div className="table-row">Goals: {preview.counts.goals}</div>
              <div className="table-row">Roadmap cards: {preview.counts.roadmap}</div>
              <div className="table-row">Journal entries: {preview.counts.journal}</div>
              <div className="table-row">Session logs: {preview.counts.logs}</div>
              <div className="table-row">Focus sessions: {preview.counts.focus}</div>
              <div className="table-row">Weekly reviews: {preview.counts.weeklyReviews}</div>
              <div className="table-row">Weekly snapshots: {preview.counts.weeklySnapshots}</div>
              <div className="table-row">Local repos: {preview.counts.localRepos}</div>
              <div className="table-row">Date range: {preview.counts.dateRange}</div>
            </div>
            <div className="table">
              <div className="table-row">
                Summary Δ: +{preview.diff.summary.additions} / ~{preview.diff.summary.changes} / -{preview.diff.summary.removals}
              </div>
              <div className="table-row">
                Conflicts on merge: {preview.diff.summary.conflicts}
              </div>
              <div className="table-row">
                Projects Δ: +{preview.diff.projects.added} / ~{preview.diff.projects.changed} / -{preview.diff.projects.removed}
              </div>
              <div className="table-row">
                Tasks Δ: +{preview.diff.tasks.added} / ~{preview.diff.tasks.changed} / -{preview.diff.tasks.removed}
              </div>
              <div className="table-row">
                Roadmap Δ: +{preview.diff.roadmap.added} / ~{preview.diff.roadmap.changed} / -{preview.diff.roadmap.removed}
              </div>
              <div className="table-row">
                Journal Δ: +{preview.diff.journal.added} / ~{preview.diff.journal.changed} / -{preview.diff.journal.removed}
              </div>
              <div className="table-row">
                Weekly reviews Δ: +{preview.diff.weeklyReviews.added} / ~{preview.diff.weeklyReviews.changed} / -{preview.diff.weeklyReviews.removed}
              </div>
              <div className="table-row">
                Weekly snapshots Δ: +{preview.diff.weeklySnapshots.added} / ~{preview.diff.weeklySnapshots.changed} / -{preview.diff.weeklySnapshots.removed}
              </div>
            </div>
            {preview.diff.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                <div className="font-medium">Warnings</div>
                <div className="mt-2 grid gap-2">
                  {preview.diff.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="filter-row">
              <button className="button-primary" onClick={() => applyImport("replace")}>
                Replace All
              </button>
              <button className="button-secondary" onClick={() => applyImport("merge_keep")}>
                Merge (Keep Local)
              </button>
              <button className="button-secondary" onClick={() => applyImport("merge_overwrite")}>
                Merge (Overwrite)
              </button>
            </div>
            <div className="grid gap-2 text-sm text-muted md:grid-cols-3">
              <div className="rounded-lg border border-muted bg-subtle p-3">
                Replace All swaps your local state for the imported file.
              </div>
              <div className="rounded-lg border border-muted bg-subtle p-3">
                Merge (Keep Local) adds missing items and keeps your current copy for {preview.diff.summary.conflicts} conflicts.
              </div>
              <div className="rounded-lg border border-muted bg-subtle p-3">
                Merge (Overwrite) adds missing items and replaces your current copy for {preview.diff.summary.conflicts} conflicts.
              </div>
            </div>
          </div>
        )}
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
          <div className="mt-2 space-y-2 text-sm text-muted">
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
        {startupHealth && (
          <div className="mt-3 rounded-lg border border-muted bg-subtle p-3 text-xs text-muted">
            <div>API reachable: {startupHealth.apiReachable ? "Yes" : "No"}</div>
            <div>Git available: {startupHealth.gitAvailable ? "Yes" : "No"}</div>
            <div>Last scan: {startupHealth.lastScanAt ? formatDate(startupHealth.lastScanAt) : "Never"}</div>
            <div>Watcher: {startupHealth.scanStatus?.watcherActive ? "On" : "Off"}</div>
            <div>
              Watch dirs:
              {startupHealth.watchDirs.map((dir) => (
                <div key={dir.dir}>
                  {dir.dir} — {dir.exists ? "OK" : "Missing"}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Appearance</p>
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
  );
}
