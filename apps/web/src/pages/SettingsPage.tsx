import React, { useEffect, useState } from "react";
import { insightRules, type AppState } from "@linkra/shared";
import { api } from "../lib/api";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { formatDate } from "../lib/date";
import Select from "../components/Select";

export default function SettingsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [startupInfo, setStartupInfo] = useState<{ os: string; instructions: string; files: string[] } | null>(null);
  const [startupHealth, setStartupHealth] = useState<{
    apiReachable: boolean;
    lastScanAt: string | null;
    scanStatus: any;
    gitAvailable: boolean;
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

  const persistState = async (
    mutate: (draft: AppState) => void,
    failureMessage = "Failed to save settings."
  ) => {
    const next = cloneAppState(state);
    mutate(next);
    const saved = await save(next);
    if (!saved) {
      push(failureMessage, "error");
      return null;
    }
    return next;
  };

  const generateStartup = async () => {
    const result = await api.createStartup();
    setStartupInfo(result);
    push("Startup files generated.");
  };

  const toggleStartup = async (enabled: boolean) => {
    const saved = await persistState((next) => {
      next.userSettings.startOnLogin = enabled;
    }, "Failed to update startup setting.");
    if (!saved) return;
    if (enabled) {
      await generateStartup();
    }
  };


  const toggleInsightRule = async (ruleId: string) => {
    const saved = await persistState((next) => {
      const disabled = new Set(next.userSettings.disabledInsightRules ?? []);
      if (disabled.has(ruleId)) {
        disabled.delete(ruleId);
      } else {
        disabled.add(ruleId);
      }
      next.userSettings.disabledInsightRules = Array.from(disabled);
    }, "Failed to update insight rules.");
    if (!saved) return;
  };

  const toggleWatcher = async (enabled: boolean) => {
    await persistState((next) => {
      next.userSettings.gitWatcherEnabled = enabled;
    }, "Failed to update watcher setting.");
  };

  const updateBackupSettings = async (key: "enableDailyBackup" | "backupRetentionDays", value: boolean | number) => {
    await persistState((next) => {
      if (key === "enableDailyBackup" && typeof value === "boolean") {
        next.userSettings.enableDailyBackup = value;
      }
      if (key === "backupRetentionDays" && typeof value === "number") {
        next.userSettings.backupRetentionDays = value;
      }
    }, "Failed to update backup settings.");
  };

  const runBackup = async () => {
    const result = await api.backupRun(state, state.userSettings.backupRetentionDays);
    push(`Backup saved to ${result.filepath}`);
  };

  const runScan = async () => {
    const result = await api.gitScan(state);
    const saved = await save(result.state);
    if (!saved) return;
    setScanStatus({ lastScanAt: result.lastScanAt, errors: result.errors });
    push("Local Git scan complete.");
  };

  const addWatchDir = async () => {
    if (!watchDir.trim()) return;
    const saved = await persistState((next) => {
      next.userSettings.repoWatchDirs = Array.from(
        new Set([...next.userSettings.repoWatchDirs, watchDir.trim()])
      );
    }, "Failed to add watch directory.");
    if (!saved) return;
    setWatchDir("");
  };

  const removeWatchDir = async (dir: string) => {
    await persistState((next) => {
      next.userSettings.repoWatchDirs = next.userSettings.repoWatchDirs.filter((item) => item !== dir);
    }, "Failed to remove watch directory.");
  };

  const updateScanInterval = async (minutes: number) => {
    await persistState((next) => {
      next.userSettings.repoScanIntervalMinutes = minutes;
    }, "Failed to update scan interval.");
  };

  const addExcludePattern = async () => {
    if (!excludePattern.trim()) return;
    const saved = await persistState((next) => {
      next.userSettings.repoExcludePatterns = Array.from(
        new Set([...next.userSettings.repoExcludePatterns, excludePattern.trim()])
      );
    }, "Failed to add exclude pattern.");
    if (!saved) return;
    setExcludePattern("");
  };

  const removeExcludePattern = async (pattern: string) => {
    await persistState((next) => {
      next.userSettings.repoExcludePatterns = next.userSettings.repoExcludePatterns.filter(
        (item) => item !== pattern
      );
    }, "Failed to remove exclude pattern.");
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
            <Select
              className="w-full"
              value={String(state.userSettings.repoScanIntervalMinutes)}
              onChange={(val) => updateScanInterval(Number(val))}
              options={[
                { value: "5", label: "Every 5 min" },
                { value: "15", label: "Every 15 min" },
                { value: "30", label: "Every 30 min" },
                { value: "60", label: "Every 60 min" }
              ]}
            />
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
              {state.userSettings.repoWatchDirs.map((dir) => (
                <div key={dir}>
                  {dir}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
