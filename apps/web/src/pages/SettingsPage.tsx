import React, { useEffect, useState } from "react";
import { insightRules, type AppState } from "@linkra/shared";
import { api } from "../lib/api";
import { cloneAppState } from "../lib/appStateModel";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";
import { formatDate } from "../lib/date";
import Select from "../components/Select";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";

export default function SettingsPage() {
  const { state, save } = useAppState();
  const { push } = useToast();
  const [watchDir, setWatchDir] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [scanStatus, setScanStatus] = useState<{ lastScanAt: string | null; errors: string[] } | null>(null);

  useEffect(() => {
    api.gitRepos().then((result) => setScanStatus({ lastScanAt: result.lastScanAt, errors: result.errors })).catch(() => null);
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

  const runScan = async () => {
    if (state.userSettings.repoWatchDirs.length === 0) {
      push("Add a watch directory before scanning for git repos.", "warning");
      return;
    }

    try {
      const result = await api.gitScan(state);
      const saved = await save(result.state);
      if (!saved) return;
      setScanStatus({ lastScanAt: result.lastScanAt, errors: result.errors });
      if (result.repos.length === 0) {
        push("No git repos found. Check folder path and scan again.", "warning");
        return;
      }
      push(`Local Git scan complete. ${result.repos.length} repo${result.repos.length === 1 ? "" : "s"} found.`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Local Git scan failed.", "error");
    }
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
    <div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Settings</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(93,216,255,0.5)]"></span>
            System Configuration
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <GlassPanel variant="standard" className="space-y-4 p-6">
          <SectionHeader 
            eyebrow="Local Git" 
            title="Repo Scanning" 
          />
          <div className="text-sm text-muted space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span>{localRepos.length > 0 ? `${localRepos.length} repo${localRepos.length !== 1 ? "s" : ""} found` : "No repos found"}</span>
              <span>·</span>
              <span>Last scan: {lastScanAt ? formatDate(lastScanAt) : "Never"}</span>
              {scanErrors.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-200">{scanErrors.length} error{scanErrors.length !== 1 ? "s" : ""}</span>
                </>
              )}
            </div>
            {localRepos.length === 0 && lastScanAt && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                No git repos were found in the scanned directories. Check your watch folder paths — they should contain folders with <code className="font-mono">.git</code> directories, or be parent folders of such projects.
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              className="input"
              placeholder="Add watch directory (e.g. /Users/you/Developer)"
              value={watchDir}
              onChange={(e) => setWatchDir(e.target.value)}
              autoComplete="off"
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
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-strong">Detected repos</div>
              <span className="text-xs text-muted">{localRepos.length} visible in app state</span>
            </div>
            {localRepos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-muted">
                No git repos found. Check folder path, then scan again. This folder does not contain detectable git repos.
              </div>
            ) : (
              <div className="table">
                {localRepos.map((repo) => (
                  <div key={repo.id} className="table-row items-start">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-strong truncate">{repo.name}</div>
                      <div className="text-xs text-muted truncate">{repo.path}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="chip">{repo.todayCommitCount} today</span>
                      {repo.scanError ? (
                        <span className="text-xs text-amber-200">Scan issue</span>
                      ) : repo.dirty ? (
                        <span className="text-xs text-amber-200">Dirty</span>
                      ) : (
                        <span className="text-xs text-emerald-300">Ready</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              autoComplete="off"
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
        </GlassPanel>

        <GlassPanel variant="standard" className="space-y-4 p-6">
          <SectionHeader 
            eyebrow="Insights" 
            title="Signals → Actions" 
          />
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
        </GlassPanel>
      </div>
    </div>
  );
}
