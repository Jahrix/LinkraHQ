import React, { useEffect, useState } from "react";
import { insightRules } from "@linkra/shared";
import { api } from "../lib/api";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { formatDate } from "../lib/date";

export default function SettingsPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
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
    <div className="space-y-6 max-w-4xl">
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
