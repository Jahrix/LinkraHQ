import React, { useEffect, useState } from "react";
import { ExportBundleSchema, SCHEMA_VERSION, type ExportBundle } from "@linkra/shared";
import { api } from "../lib/api";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { formatDate } from "../lib/date";

interface ImportPreview {
  bundle: ExportBundle;
  counts: {
    projects: number;
    tasks: number;
    goals: number;
    roadmap: number;
    logs: number;
    focus: number;
    dateRange: string;
  };
}

export default function SettingsPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [startupInfo, setStartupInfo] = useState<{ os: string; instructions: string; files: string[] } | null>(null);
  const [watchDir, setWatchDir] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [scanStatus, setScanStatus] = useState<{ lastScanAt: string | null; errors: string[] } | null>(null);

  useEffect(() => {
    api.startupStatus().then(setStartupInfo).catch(() => null);
    api.gitRepos().then((result) => setScanStatus({ lastScanAt: result.lastScanAt, errors: result.errors })).catch(() => null);
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
      const parsed = ExportBundleSchema.parse(data);
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
        dateRange
      };
      setPreview({ bundle: parsed, counts });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid JSON schema");
      setPreview(null);
    }
  };

  const applyImport = async (mode: "replace" | "merge") => {
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
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">GitHub</p>
          <h2 className="text-lg font-semibold">Connection</h2>
        </div>
        <p className="text-sm text-white/60">
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
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Local Git</p>
          <h2 className="text-lg font-semibold">Repo Scanning</h2>
        </div>
        <div className="text-sm text-white/60">
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
            <p className="text-sm text-white/50">No watch directories yet.</p>
          )}
          {state.userSettings.repoWatchDirs.map((dir) => (
            <div key={dir} className="table-row">
              <span className="text-sm text-white/70">{dir}</span>
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
              className="chip hover:bg-white/20"
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

      <div className="panel space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Data</p>
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
              <p className="text-sm text-white/60">
                Schema {preview.bundle.schema_version} → {SCHEMA_VERSION}
              </p>
            </div>
            <div className="table">
              <div className="table-row">Projects: {preview.counts.projects}</div>
              <div className="table-row">Tasks: {preview.counts.tasks}</div>
              <div className="table-row">Goals: {preview.counts.goals}</div>
              <div className="table-row">Roadmap cards: {preview.counts.roadmap}</div>
              <div className="table-row">Session logs: {preview.counts.logs}</div>
              <div className="table-row">Focus sessions: {preview.counts.focus}</div>
              <div className="table-row">Date range: {preview.counts.dateRange}</div>
            </div>
            <div className="filter-row">
              <button className="button-primary" onClick={() => applyImport("replace")}>
                Replace All
              </button>
              <button className="button-secondary" onClick={() => applyImport("merge")}>
                Merge
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Startup</p>
          <h2 className="text-lg font-semibold">Autostart</h2>
        </div>
        <p className="text-sm text-white/60">
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
          <div className="mt-2 space-y-2 text-sm text-white/60">
            <p>Detected OS: {startupInfo.os}</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              {startupInfo.instructions}
            </pre>
            <div>
              <p className="text-white/60">Generated files:</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-white/60">
                {startupInfo.files.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="panel space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Appearance</p>
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
